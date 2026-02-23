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

  return useContext(ctx ?? FakeContext) as T | null;
}

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
