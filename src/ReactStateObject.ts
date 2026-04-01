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

/**
 * Marks a child {@link ReactStateObject} property as being owned by its
 * parent state object so the child's `mount()` and `unmount()` lifecycle
 * methods run automatically with the parent.
 *
 * Use this when one state object creates another state object and the parent
 * should control the child's lifetime. Unmarked properties are ignored during
 * lifecycle traversal.
 *
 * This decorator only works on class fields and accessors whose runtime value
 * is a {@link ReactStateObject} instance.
 *
 * @example
 * ```ts
 * class FiltersState extends ReactStateObject {
 *   @observable accessor query = '';
 * }
 *
 * class TableState extends ReactStateObject {
 *   @mountStateObject
 *   @observable accessor filters = new FiltersState();
 * }
 * ```
 *
 * @example
 * ```ts
 * class PageState extends ReactStateObject {
 *   @mountStateObject
 *   accessor modal = new ModalState();
 * }
 * ```
 */
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
 * Base class for class-based state that is owned by a React component.
 *
 * Extend this class when you want a MobX-friendly state model that can:
 *
 * - run setup logic when the owning component mounts
 * - clean up subscriptions, timers, and observers on unmount
 * - propagate lifecycle to child state objects marked with
 *   {@link mountStateObject}
 * - receive values from React hooks through decorators such as
 *   {@link fromHook} and {@link injectInstance}
 *
 * Create instances with {@link useMountStateObject}. That hook is the public
 * entry point that constructs the instance, records hook-backed accessors, and
 * triggers lifecycle methods at the right time.
 *
 * @example
 * ```ts
 * class CounterState extends ReactStateObject {
 *   @observable accessor count = 0;
 *
 *   protected mount(): void {
 *     this.withCleanup(() => {
 *       const id = window.setInterval(() => {
 *         this.count += 1;
 *       }, 1000);
 *
 *       return () => {
 *         window.clearInterval(id);
 *       };
 *     });
 *   }
 * }
 * ```
 *
 * @example
 * ```tsx
 * const CounterScreen = observer(() => {
 *   const state = useMountStateObject(
 *     () => new CounterState()
 *   );
 *
 *   return <div>{state.count}</div>;
 * });
 * ```
 */
export class ReactStateObject {
  /**
   * Runs once after the owning React component has mounted.
   *
   * Override this to start subscriptions, observers, timers, or any other
   * setup work that should begin when the state object becomes active.
   *
   * For most cleanup scenarios, prefer registering cleanup with
   * {@link withCleanup} instead of storing manual disposer logic yourself.
   *
   * @example
   * ```ts
   * protected mount(): void {
   *   this.withCleanup(() => {
   *     const stop = autorun(() => {
   *       console.log(this.count);
   *     });
   *
   *     return stop;
   *   });
   * }
   * ```
   */
  protected mount(): void {
    // no-op
  }

  /**
   * Runs once before the owning React component is unmounted.
   *
   * Override this when you need explicit cleanup logic in addition to anything
   * you registered through {@link withCleanup}.
   *
   * @example
   * ```ts
   * protected unmount(): void {
   *   this.resizeObserver.disconnect();
   * }
   * ```
   */
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

  /**
   * Registers callbacks that should participate in this state object's mount
   * and unmount lifecycle.
   *
   * This is a lower-level composition API. It is useful when you want to
   * attach lifecycle behavior from a constructor or helper method instead of
   * overriding `mount()` and `unmount()` directly.
   *
   * In most applications, {@link withCleanup} is the simpler API to use.
   *
   * @example
   * ```ts
   * class LoggerState extends ReactStateObject {
   *   constructor() {
   *     super();
   *
   *     this.hookIntoLifecycle({
   *       onMount: () => console.log('mounted'),
   *       onUnmount: () => console.log('unmounted'),
   *     });
   *   }
   * }
   * ```
   */
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

  /**
   * Runs setup logic immediately and stores the returned cleanup function so it
   * is called automatically during unmount.
   *
   * This is the most convenient way to manage resources such as MobX disposers,
   * DOM listeners, intervals, or browser observers from a `ReactStateObject`.
   *
   * @example
   * ```ts
   * protected mount(): void {
   *   this.withCleanup(() => {
   *     const onResize = () => {
   *       console.log(window.innerWidth);
   *     };
   *
   *     window.addEventListener('resize', onResize);
   *
   *     return () => {
   *       window.removeEventListener('resize', onResize);
   *     };
   *   });
   * }
   * ```
   */
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

/**
 * Function signature used by the low-level hook recording system.
 *
 * Most library consumers do not need to reference this type directly unless
 * they are building abstractions on top of
 * {@link invokeReactStateObjectHook}.
 *
 * @example
 * ```ts
 * const hook: Hook = () => useLocation();
 * ```
 */
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

/**
 * Registers and executes a React hook callback during
 * {@link useMountStateObject} initialization.
 *
 * This is a low-level escape hatch used internally by {@link fromHook}. Most
 * consumers should use `@fromHook(...)` instead of calling this function
 * directly.
 *
 * The function must run while a state object is being created inside
 * `useMountStateObject(...)`. Calling it anywhere else throws because the
 * library would have no active hook recorder to attach the hook to.
 *
 * @example
 * ```ts
 * invokeReactStateObjectHook(() => useLocation());
 * ```
 */
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

/**
 * Creates an accessor decorator that assigns a React hook result to a class
 * accessor on a {@link ReactStateObject}.
 *
 * Use this when a state object needs data or callbacks that normally come from
 * React hooks, such as router state, context values, or feature helpers. The
 * state object must be created through {@link useMountStateObject} so the hook
 * can be recorded on initialization and replayed on later renders.
 *
 * The decorated member should usually be an `accessor`, and it is commonly
 * combined with MobX decorators such as `@observable`.
 *
 * @example
 * ```ts
 * class RouteState extends ReactStateObject {
 *   @fromHook(() => useLocation())
 *   @observable
 *   accessor location!: ReturnType<typeof useLocation>;
 * }
 * ```
 *
 * @example
 * ```ts
 * class ModalState extends ReactStateObject {
 *   @fromHook(function (this: ModalState) {
 *     return useModalLauncher(this);
 *   })
 *   @observable
 *   accessor openModal!: () => void;
 * }
 * ```
 */
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

/**
 * Creates an accessor decorator that reads a class instance from the nearest
 * {@link InstanceInjectionRoot} / `BindInstanceForInjection` provider branch.
 *
 * This is a convenience decorator built on top of {@link fromHook}. It is
 * useful when one `ReactStateObject` depends on another shared state instance
 * and you want the dependency to be resolved automatically from React context.
 *
 * By default the injected instance is required and the accessor throws if no
 * matching binding exists. Pass `{ optional: true }` to receive `null`
 * instead.
 *
 * @example
 * ```ts
 * class PageState extends ReactStateObject {
 *   @injectInstance(AppState)
 *   @observable
 *   accessor appState!: AppState;
 * }
 * ```
 *
 * @example
 * ```ts
 * class PageState extends ReactStateObject {
 *   @injectInstance(SessionState, { optional: true })
 *   @observable
 *   accessor session!: SessionState | null;
 * }
 * ```
 */
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

/**
 * Creates a {@link ReactStateObject}, connects it to the current React
 * component, and runs the object's lifecycle.
 *
 * This is the required way to create `ReactStateObject` instances for use in
 * React components. It:
 *
 * - creates the instance on first render
 * - records hooks referenced by decorators such as {@link fromHook}
 * - replays those hooks on later renders in a stable order
 * - calls `mount()` after the component mounts
 * - calls `unmount()` during cleanup
 * - recreates the state object when `dependencies` change
 *
 * Do not replace this with `new MyState()` inside a component. Doing so breaks
 * the hook recording model used by `@fromHook(...)` and bypasses lifecycle
 * ownership.
 *
 * @example
 * ```tsx
 * const state = useMountStateObject(
 *   () => new CounterState()
 * );
 * ```
 *
 * @example
 * ```tsx
 * const state = useMountStateObject(
 *   () => new UserState(userId),
 *   [userId]
 * );
 * ```
 */
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
