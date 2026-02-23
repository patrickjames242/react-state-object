import { isObservableObject, keys } from 'mobx';
import { useEffect, useRef } from 'react';
import { useInjectInstance } from './InstanceInjectionSystem';

/**
 * Decorator function type for class accessor decorators.
 */
type AccessorDecorator<This, Value> = (
  _target: unknown,
  context: ClassAccessorDecoratorContext<This, Value>
) => void;

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

  public _innerMount(): void {
    for (const child of this.getChildStateObjects()) {
      child._innerMount();
    }

    for (const action of this.mountActions) {
      action();
    }

    this.mount();
  }

  public _innerUnmount(): void {
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
    const seenKeys = new Set<PropertyKey>();

    for (const key of Object.keys(this)) {
      seenKeys.add(key);
      const value = (this as Record<string, unknown>)[key];
      if (this.isChildReactStateObject(key, value)) {
        yield value;
      }
    }

    if (!isObservableObject(this)) {
      return;
    }

    for (const key of keys(this)) {
      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      const value = (this as Record<string, unknown>)[key];
      if (this.isChildReactStateObject(key, value)) {
        yield value;
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
      this as {
        [FROM_HOOK_PROPERTIES_KEY]?: Set<PropertyKey>;
      }
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

const FROM_HOOK_PROPERTIES_KEY = Symbol(
  'FROM_HOOK_PROPERTIES'
);

export function fromHook<RSO extends ReactStateObject, R>(
  hook: (this: RSO, instance: RSO) => R
): AccessorDecorator<RSO, R> {
  return (_target, context) => {
    context.addInitializer(function (this: RSO) {
      const instance = this as RSO &
        Record<PropertyKey, unknown>;

      const fromHookProperties =
        (
          instance as {
            [FROM_HOOK_PROPERTIES_KEY]?: Set<PropertyKey>;
          }
        )[FROM_HOOK_PROPERTIES_KEY] ??
        new Set<PropertyKey>();

      (
        instance as {
          [FROM_HOOK_PROPERTIES_KEY]: Set<PropertyKey>;
        }
      )[FROM_HOOK_PROPERTIES_KEY] = fromHookProperties;

      fromHookProperties.add(context.name);

      invokeReactStateObjectHook(() => {
        const wasVariableSetInitially = useRef(false);
        const hookResult = hook.call(
          instance as RSO,
          instance
        );

        const setVariable = (): void => {
          if (
            !wasVariableSetInitially.current ||
            instance[context.name] !== hookResult
          ) {
            instance[context.name] = hookResult;
          }

          wasVariableSetInitially.current = true;
        };

        if (!wasVariableSetInitially.current) {
          setVariable();
        }

        useEffect(() => {
          setVariable();
        });
      });
    });
  };
}

export function injectInstance<
  TClass extends new (...args: any[]) => any,
>(
  klass: TClass
): AccessorDecorator<
  ReactStateObject,
  InstanceType<TClass>
> {
  return fromHook(() => {
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
    const stateObject = stateObjectRef.current;

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
