import { action } from 'mobx';
import {
  type DependencyList,
  useEffect,
  useRef,
} from 'react';
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

const MOUNT_STATE_OBJECT_PROPERTIES_KEY = Symbol(
  'MOUNT_STATE_OBJECT_PROPERTIES'
);

type WithMountStateObjectPropertiesMetadata = {
  [MOUNT_STATE_OBJECT_PROPERTIES_KEY]?: Set<PropertyKey>;
};

type LifecyclePhase = 'mount' | 'unmount';

class LifecycleMethodContext {
  private readonly visitedInstances =
    new Set<ReactStateObject>();

  constructor(readonly phase: LifecyclePhase) {}

  public hasVisited(
    stateObject: ReactStateObject
  ): boolean {
    return this.visitedInstances.has(stateObject);
  }

  public recordVisit(stateObject: ReactStateObject): void {
    this.visitedInstances.add(stateObject);
  }
}

function getMountStateObjectProperties(
  instance: ReactStateObject
): Set<PropertyKey> {
  return (
    (instance as WithMountStateObjectPropertiesMetadata)[
      MOUNT_STATE_OBJECT_PROPERTIES_KEY
    ] ?? new Set<PropertyKey>()
  );
}

function recordMountStateObjectProperty(
  instance: object,
  propertyKey: PropertyKey
): void {
  const metadataTarget =
    instance as WithMountStateObjectPropertiesMetadata;
  const mountStateObjectProperties =
    metadataTarget[MOUNT_STATE_OBJECT_PROPERTIES_KEY] ??
    new Set<PropertyKey>();

  metadataTarget[MOUNT_STATE_OBJECT_PROPERTIES_KEY] =
    mountStateObjectProperties;
  mountStateObjectProperties.add(propertyKey);
}

export function mountStateObject<This, Value>(
  target: ClassAccessorDecoratorTarget<This, Value>,
  context: ClassAccessorDecoratorContext<This, Value>
): ClassAccessorDecoratorResult<This, Value> | void;

export function mountStateObject<This, Value>(
  target: undefined,
  context: ClassFieldDecoratorContext<This, Value>
): void;

export function mountStateObject<This, Value>(
  target:
    | ClassAccessorDecoratorTarget<This, Value>
    | undefined,
  context:
    | ClassAccessorDecoratorContext<This, Value>
    | ClassFieldDecoratorContext<This, Value>
): unknown {
  if (context.kind === 'accessor') {
    context.addInitializer(function () {
      recordMountStateObjectProperty(
        this as unknown as object,
        context.name
      );
    });

    return undefined;
  }

  if (context.kind === 'field') {
    return function (this: This, value: Value): Value {
      recordMountStateObjectProperty(
        this as object,
        context.name
      );
      return value;
    };
  }

  throw new Error(
    '@mountStateObject can only be used on class fields and accessors.'
  );
}

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

  private _innerMount(
    context: LifecycleMethodContext
  ): void {
    context.recordVisit(this);

    for (const [
      key,
      child,
    ] of this.getMountedChildStateObjects(context.phase)) {
      if (context.hasVisited(child)) {
        throw new Error(
          `Duplicate child state object detected during ${context.phase} on ${this.constructor.name}.${String(
            key
          )}: ${child.constructor.name} is already part of the current lifecycle pass. Child ownership must be unique.`
        );
      }

      child._innerMount(context);
    }

    for (const action of this.mountActions) {
      action();
    }

    this.mount();
  }

  private _innerUnmount(
    context: LifecycleMethodContext
  ): void {
    context.recordVisit(this);

    this.unmount();

    for (const [
      key,
      child,
    ] of this.getMountedChildStateObjects(context.phase)) {
      if (context.hasVisited(child)) {
        throw new Error(
          `Duplicate child state object detected during ${context.phase} on ${this.constructor.name}.${String(
            key
          )}: ${child.constructor.name} is already part of the current lifecycle pass. Child ownership must be unique.`
        );
      }

      child._innerUnmount(context);
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

  private *getMountedChildStateObjects(
    phase: LifecyclePhase
  ): Generator<[PropertyKey, ReactStateObject]> {
    for (const key of getMountStateObjectProperties(this)) {
      const value = (this as Record<PropertyKey, unknown>)[
        key
      ];

      if (!(value instanceof ReactStateObject)) {
        throw new Error(
          `Invalid @mountStateObject property ${this.constructor.name}.${String(
            key
          )} during ${phase}: expected a ReactStateObject instance.`
        );
      }

      yield [key, value];
    }
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
const EMPTY_DEPENDENCIES: DependencyList = [];

function dependenciesAreEqual(
  previousDependencies: DependencyList | null,
  nextDependencies: DependencyList
): boolean {
  if (previousDependencies === null) {
    return false;
  }

  if (
    previousDependencies.length !== nextDependencies.length
  ) {
    return false;
  }

  for (
    let index = 0;
    index < nextDependencies.length;
    index += 1
  ) {
    if (
      !Object.is(
        previousDependencies[index],
        nextDependencies[index]
      )
    ) {
      return false;
    }
  }

  return true;
}

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
      (instance as unknown as Record<PropertyKey, R>)[
        context.name
      ] = value;
    };

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
>(
  factory: () => TStateObject,
  dependencies?: DependencyList
): TStateObject {
  const stateObjectRef = useRef<TStateObject | null>(null);
  const hooksRef = useRef<Hook[]>([]);
  const dependenciesRef = useRef<DependencyList | null>(
    null
  );
  const currentDependencies =
    dependencies ?? EMPTY_DEPENDENCIES;

  if (
    stateObjectRef.current === null ||
    !dependenciesAreEqual(
      dependenciesRef.current,
      currentDependencies
    )
  ) {
    hooksRef.current = recordHooks(() => {
      stateObjectRef.current = factory();
    });
    dependenciesRef.current = currentDependencies;
  } else {
    for (const hook of hooksRef.current) {
      hook();
    }
  }

  const stateObject = stateObjectRef.current;

  useEffect(() => {
    if (!stateObject) {
      throw new Error(
        'useMountStateObject failed to initialize a state object.'
      );
    }

    (stateObject as any)._innerMount(
      new LifecycleMethodContext('mount')
    );

    return () => {
      (stateObject as any)._innerUnmount(
        new LifecycleMethodContext('unmount')
      );
    };
  }, currentDependencies);

  return stateObject as TStateObject;
}
