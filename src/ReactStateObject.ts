import { $mobx, action, isObservableObject } from 'mobx';
import { ObservableObjectAdministration } from 'mobx/dist/types/observableobject';
import { useEffect, useRef } from 'react';
import {
  useInjectInstance,
  useInjectInstanceOrNull,
} from './InstanceInjectionSystem';

/**
 * Decorator function type for class accessor decorators.
 */
type AccessorDecorator<This, Value> = (
  target: ClassAccessorDecoratorTarget<This, Value>,
  context: ClassAccessorDecoratorContext<This, Value>
) => ClassAccessorDecoratorResult<This, Value> | void;

const FROM_HOOK_PROPERTIES_KEY = Symbol(
  'FROM_HOOK_PROPERTIES'
);

type WithFromHookPropertiesMetadata = {
  [FROM_HOOK_PROPERTIES_KEY]?: Set<PropertyKey>;
};

/**
 * Base class for state objects that need React lifecycle hooks,
 * nested child state object mount/unmount propagation, and hook-backed
 * accessors via decorators.
 */
export class ReactStateObject {
  protected mount(): void {
    // no-op
  }

  protected unmount(): void {
    // no-op
  }

  private _innerMount(): void {
    for (const child of this.getChildStateObjects()) {
      child._innerMount();
    }

    for (const action of this.mountActions) {
      action();
    }

    this.mount();
  }

  private _innerUnmount(): void {
    this.unmount();

    for (const child of this.getChildStateObjects()) {
      child._innerUnmount();
    }

    for (const action of this.unmountActions) {
      action();
    }
  }

  private readonly mountActions = new Set<() => void>();
  private readonly unmountActions = new Set<() => void>();

  protected hookIntoLifecycle(methods: {
    onMount?: () => void;
    onUnmount?: () => void;
  }): void {
    if (methods.onMount) {
      this.mountActions.add(methods.onMount);
    }

    if (methods.onUnmount) {
      this.unmountActions.add(methods.onUnmount);
    }
  }

  protected withCleanup(action: () => () => void): void {
    const disposeFn = action();
    this.unmountActions.add(disposeFn);
  }

  private *getChildStateObjects(): Generator<ReactStateObject> {
    const seenKeys = new Set<string>();
    for (const key of Object.keys(this)) {
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      const value: any = (this as any)[key];
      if (this.isChildReactStateObject(key, value)) {
        yield value;
      }
    }

    if (isObservableObject(this)) {
      const observableObjectAdministration:
        | ObservableObjectAdministration
        | undefined = (this as any)[$mobx];
      for (const key of observableObjectAdministration?.values_.keys() ??
        []) {
        if (seenKeys.has(key.toString())) {
          continue;
        }
        seenKeys.add(key.toString());
        const value = (this as any)[key];
        if (this.isChildReactStateObject(key, value)) {
          yield value;
        }
      }
    }
  }

  private isChildReactStateObject(
    key: PropertyKey,
    value: unknown
  ): value is ReactStateObject {
    if (!(value instanceof ReactStateObject)) {
      return false;
    }

    const fromHookProperties = (
      this as WithFromHookPropertiesMetadata
    )[FROM_HOOK_PROPERTIES_KEY];

    if (fromHookProperties?.has(key)) {
      return false;
    }

    return true;
  }
}

export type Hook = () => unknown;

class HookRecorder {
  private readonly _hooks: Hook[] = [];

  public get hooks(): Hook[] {
    return this._hooks;
  }

  public invoke(hook: Hook): unknown {
    this._hooks.push(hook);
    return hook();
  }
}

const hookRecorderStack: HookRecorder[] = [];

export function invokeReactStateObjectHook(
  hook: Hook
): unknown {
  const hookRecorder =
    hookRecorderStack[hookRecorderStack.length - 1];

  if (!hookRecorder) {
    throw new Error(
      'invokeReactStateObjectHook must be called within a useMountStateObject state initialization function'
    );
  }

  return hookRecorder.invoke(hook);
}

export function fromHook<RSO extends ReactStateObject, R>(
  hook: (this: RSO, instance: RSO) => R
): AccessorDecorator<RSO, R> {
  return (target, context) => {
    // When @fromHook wraps another accessor decorator such as
    // @observable or @observable.ref, the inner decorator may
    // initialize its own backing state before our hook-derived
    // initial value has been fully applied. Keep that first hook
    // result around so the outermost getter can reconcile the final
    // accessor state on first read if needed.
    const pendingInitialValues = new WeakMap<RSO, R>();

    // Write back through the decorated property instead of mutating
    // storage directly. That preserves the full accessor chain so any
    // inner decorator, including MobX, observes a normal setter call.
    const assignAccessorValue = (
      instance: RSO,
      value: R
    ): void => {
      (
        instance as unknown as Record<PropertyKey, R>
      )[context.name] = value;
    };

    context.addInitializer(function (this: RSO) {
      const instance = this;
      const metadataTarget =
        instance as unknown as WithFromHookPropertiesMetadata;

      const fromHookProperties =
        metadataTarget[FROM_HOOK_PROPERTIES_KEY] ??
        new Set<PropertyKey>();

      metadataTarget[FROM_HOOK_PROPERTIES_KEY] =
        fromHookProperties;

      // Hook-backed properties are populated by React render logic,
      // not by this object's child lifecycle tree, so they must be
      // excluded from child-state traversal.
      fromHookProperties.add(context.name);
    });

    return {
      get(this: RSO): R {
        if (pendingInitialValues.has(this)) {
          const pendingValue = pendingInitialValues.get(
            this
          ) as R;
          const currentValue = target.get.call(this);

          if (currentValue !== pendingValue) {
            // If an inner decorator already materialized backing state
            // from the old initializer value (commonly undefined),
            // repair it here by replaying the hook value through the
            // final setter chain before anyone observes the property.
            action('@fromHook initial value sync', () => {
              assignAccessorValue(this, pendingValue);
            })();
          }

          // The pending initial value is only for first access. After
          // the accessor chain has been reconciled once, future reads
          // should go straight through the wrapped getter.
          pendingInitialValues.delete(this);
        }

        return target.get.call(this);
      },
      set(this: RSO, value: R): void {
        // Any explicit write supersedes the staged initial value.
        pendingInitialValues.delete(this);
        target.set.call(this, value);
      },
      init(this: RSO, value: R): R {
        const instance = this;

        let initialValue = value;
        invokeReactStateObjectHook(() => {
          // Run the hook during state object construction so it is
          // recorded and replayed by useMountStateObject on rerenders.
          const hookResult = hook.call(instance, instance);
          const previousValueRef = useRef<R>(hookResult);
          const hasInitializedRef = useRef(false);

          if (!hasInitializedRef.current) {
            // Returning the first hook result from `init` lets the
            // accessor's private backing slot initialize safely before
            // any later setter writes occur. We also stage that value
            // separately so the getter can repair inner decorators
            // that may have already committed the old initializer.
            initialValue = hookResult;
            pendingInitialValues.set(instance, hookResult);
            previousValueRef.current = hookResult;
            hasInitializedRef.current = true;
          }

          useEffect(() => {
            if (previousValueRef.current === hookResult) {
              return;
            }

            // Hook updates happen after render, so push them back
            // through the decorated property inside an action. This
            // keeps MobX notifications correct without bypassing any
            // accessor decorators layered under @fromHook.
            action('@fromHook value update', () => {
              assignAccessorValue(instance, hookResult);
            })();

            previousValueRef.current = hookResult;
          });
        });

        return initialValue;
      },
    };
  };
}

export function injectInstance<
  TClass extends new (...args: any[]) => any,
>(
  klass: TClass
): AccessorDecorator<
  ReactStateObject,
  InstanceType<TClass>
>;

export function injectInstance<
  TClass extends new (...args: any[]) => any,
>(
  klass: TClass,
  options: {
    optional: true;
  }
): AccessorDecorator<
  ReactStateObject,
  InstanceType<TClass> | null
>;

export function injectInstance<
  TClass extends new (...args: any[]) => any,
>(
  klass: TClass,
  options?: {
    optional?: boolean;
  }
): AccessorDecorator<
  ReactStateObject,
  InstanceType<TClass> | null
> {
  return fromHook(() => {
    if (options?.optional) {
      return useInjectInstanceOrNull(klass);
    }

    return useInjectInstance(klass);
  });
}

function recordHooks<Result>(
  withinFunction: () => Result
): Hook[] {
  const hookRecorder = new HookRecorder();
  hookRecorderStack.push(hookRecorder);

  try {
    withinFunction();
  } finally {
    hookRecorderStack.pop();
  }

  return hookRecorder.hooks;
}

export function useMountStateObject<
  TStateObject extends ReactStateObject,
>(factory: () => TStateObject): TStateObject {
  const stateObjectRef = useRef<TStateObject | null>(null);
  const hooksRef = useRef<Hook[]>([]);

  if (stateObjectRef.current === null) {
    hooksRef.current = recordHooks(() => {
      stateObjectRef.current = factory();
    });
  } else {
    for (const hook of hooksRef.current) {
      hook();
    }
  }

  useEffect(() => {
    const stateObject = stateObjectRef.current as any;

    if (!stateObject) {
      throw new Error(
        'useMountStateObject failed to initialize a state object.'
      );
    }

    stateObject._innerMount();

    return () => {
      stateObject._innerUnmount();
    };
  }, []);

  return stateObjectRef.current as TStateObject;
}
