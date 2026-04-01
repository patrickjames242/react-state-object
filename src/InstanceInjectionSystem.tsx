import {
  createContext,
  type ReactNode,
  useContext,
  useRef,
} from 'react';

type Class<T> = new (...args: any[]) => T;

type InjectionRegistry = Map<
  Class<any>,
  React.Context<any>
>;

const InstanceInjectionRootContext =
  createContext<InjectionRegistry | null>(null);

/**
 * Root provider for the library's class-instance injection system.
 *
 * Place this near the top of the React tree anywhere you want descendant
 * components or `ReactStateObject` instances to be able to resolve injected
 * class instances by type.
 *
 * Without this provider, `BindInstanceForInjection`,
 * `useInjectInstance(...)`, and `useInjectInstanceOrNull(...)` will throw.
 *
 * @example
 * ```tsx
 * <InstanceInjectionRoot>
 *   <App />
 * </InstanceInjectionRoot>
 * ```
 */
export function InstanceInjectionRoot({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const registryRef = useRef<InjectionRegistry>(new Map());

  return (
    <InstanceInjectionRootContext.Provider
      value={registryRef.current}
    >
      {children}
    </InstanceInjectionRootContext.Provider>
  );
}

function ensureContext<T>(
  registry: InjectionRegistry,
  cls: Class<T>
): React.Context<T | null> {
  let ctx = registry.get(cls) as
    | React.Context<T | null>
    | undefined;

  if (!ctx) {
    ctx = createContext<T | null>(null);
    registry.set(cls, ctx);
  }

  return ctx;
}

/**
 * Binds a concrete class instance for descendants so it can be retrieved later
 * by its constructor.
 *
 * Wrap any part of the tree that should have access to the instance through
 * {@link useInjectInstance}, {@link useInjectInstanceOrNull}, or the
 * `@injectInstance(...)` decorator.
 *
 * The `instance` must be a real class instance created with `new`. Plain
 * objects are rejected because the lookup key is the instance's constructor.
 *
 * @example
 * ```tsx
 * <BindInstanceForInjection instance={appState}>
 *   <AppLayout />
 * </BindInstanceForInjection>
 * ```
 *
 * @example
 * ```tsx
 * <InstanceInjectionRoot>
 *   <BindInstanceForInjection instance={appState}>
 *     <BindInstanceForInjection instance={pageState}>
 *       <Page />
 *     </BindInstanceForInjection>
 *   </BindInstanceForInjection>
 * </InstanceInjectionRoot>
 * ```
 */
export function BindInstanceForInjection<T>({
  instance,
  children,
}: {
  instance: T;
  children?: ReactNode;
}): JSX.Element {
  const registry = useContext(InstanceInjectionRootContext);

  if (!registry) {
    throw new Error(
      'BindInstanceForInjection must be used inside <InstanceInjectionRoot>'
    );
  }

  if (instance == null || typeof instance !== 'object') {
    throw new Error(
      'BindInstanceForInjection: instance must be a non-null class instance object.'
    );
  }

  const ctor = (instance as { constructor: unknown })
    .constructor;

  if (typeof ctor !== 'function' || ctor === Object) {
    throw new Error(
      'BindInstanceForInjection: instance must be an instance of a class (created via `new MyClass()`). Plain objects are not allowed.'
    );
  }

  const Ctx = ensureContext(registry, ctor as Class<T>);

  return (
    <Ctx.Provider value={instance}>{children}</Ctx.Provider>
  );
}

const FakeContext = createContext<null>(null);

/**
 * Returns the nearest bound instance for a class, or `null` when that class is
 * not bound on the current branch of the tree.
 *
 * Use this when the dependency is optional. The hook still requires an
 * enclosing {@link InstanceInjectionRoot}; it only relaxes the requirement for
 * a matching binding.
 *
 * @example
 * ```tsx
 * const sessionState = useInjectInstanceOrNull(SessionState);
 *
 * if (!sessionState) {
 *   return <LoginPrompt />;
 * }
 * ```
 */
export function useInjectInstanceOrNull<T>(
  cls: Class<T>
): T | null {
  const registry = useContext(InstanceInjectionRootContext);

  if (!registry) {
    throw new Error(
      'useInjectInstanceOrNull must be used inside <InstanceInjectionRoot>'
    );
  }

  const ctx = registry.get(cls) as
    | React.Context<T | null>
    | undefined;

  const fallbackContext =
    FakeContext as unknown as React.Context<T | null>;

  return useContext(ctx ?? fallbackContext);
}

/**
 * Returns the nearest bound instance for a class from the current injection
 * tree branch.
 *
 * Use this when the dependency is required. The hook throws if there is no
 * enclosing {@link InstanceInjectionRoot}, no binding for the requested class,
 * or the current branch does not contain a value for that class.
 *
 * @example
 * ```tsx
 * const appState = useInjectInstance(AppState);
 *
 * return <h1>{appState.title}</h1>;
 * ```
 */
export function useInjectInstance<T>(cls: Class<T>): T {
  const registry = useContext(InstanceInjectionRootContext);

  if (!registry) {
    throw new Error(
      'useInjectInstance must be used inside <InstanceInjectionRoot>'
    );
  }

  const ctx = registry.get(cls) as
    | React.Context<T | null>
    | undefined;

  if (!ctx) {
    throw new Error(
      `No instance of ${cls.name} has been bound above in the component tree`
    );
  }

  const value = useContext(ctx);

  if (value == null) {
    throw new Error(
      `A context for ${cls.name} exists, but no instance was found in this branch`
    );
  }

  return value;
}
