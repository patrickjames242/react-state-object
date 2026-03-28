# react-state-object

`react-state-object` is a small library for building
class-based React state that is designed to work
primarily with **MobX**.

It gives you:

- a base class (`ReactStateObject`) with mount/unmount
  lifecycle hooks
- automatic lifecycle propagation through nested child
  state objects
- a way to use React hooks inside class accessors
  (`@fromHook(...)`)
- a simple class-instance injection system for React
  trees
- a convenience decorator for injected state accessors
  (`@injectInstance(...)`)

If you are new to MobX, this README teaches the
basics first and then shows how `react-state-object`
fits on top.

## Who This Is For

This library is a good fit when you:

- like class-based state models
- use MobX for observability/computed values/actions
- want React lifecycle ownership (`mount/unmount`) for
  those classes
- want to inject shared state instances without wiring
  dozens of props

This library is **not** a replacement for MobX. It is a
small layer that helps MobX state objects live inside a
React app in a structured way.

## Install

```bash
npm install react-state-object mobx react
```

You will usually also want:

```bash
npm install mobx-react-lite
```

`mobx-react-lite` is not a peer dependency of this
package, but it is the most common way to make React
components re-render when MobX observables change.

## Peer Dependencies

- `react` `>=18`
- `mobx` `>=6.0.0 <7`

## What MobX Does (Beginner-Friendly)

MobX is a state management library built around a simple
idea:

- mark values as **observable**
- derive values with **computed** getters
- change values in **action** methods
- make React components **observer(...)** so they
  re-render when observables they read change

### Tiny MobX example (without `react-state-object` yet)

```tsx
import { action, computed, observable } from 'mobx';
import { observer } from 'mobx-react-lite';

class CounterStore {
  @observable accessor count = 0;

  @computed get doubled(): number {
    return this.count * 2;
  }

  @action increment(): void {
    this.count += 1;
  }
}

const counter = new CounterStore();

export const Counter = observer(() => {
  return (
    <div>
      <p>Count: {counter.count}</p>
      <p>Doubled: {counter.doubled}</p>
      <button onClick={() => counter.increment()}>
        Increment
      </button>
    </div>
  );
});
```

This works, but it leaves open questions:

- When should the store set up subscriptions?
- When should it clean them up?
- How do we structure nested state objects?
- How do we use React hooks in class state?
- How do we avoid prop-drilling shared state?

That is where `react-state-object` helps.

## Mental Model: MobX + react-state-object

Think of a `ReactStateObject` as:

- a **MobX-powered class state model**
- whose lifecycle is controlled by a React component
- and which may contain child state objects that mount /
  unmount automatically

Typical flow:

1. React component creates the class via
   `useMountStateObject(() => new MyState())`
2. React owns the instance lifetime
3. The state object receives `mount()` on component mount
4. The state object receives `unmount()` on component
   unmount
5. Nested child `ReactStateObject`s are mounted/unmounted
   automatically

This pattern is common in production apps for app
layout state, environment observers (window size /
element size), page-level state, and feature-specific
state trees.

## Quick Start (Recommended First Example)

This example shows the full intended pattern with MobX.

```tsx
import {
  action,
  autorun,
  computed,
  observable,
} from 'mobx';
import { observer } from 'mobx-react-lite';
import {
  ReactStateObject,
  useMountStateObject,
} from 'react-state-object';

class CounterState extends ReactStateObject {
  @observable accessor count = 0;

  @computed get doubled(): number {
    return this.count * 2;
  }

  protected mount(): void {
    // Runs once when the React component mounts.
    this.withCleanup(() => {
      // `autorun` returns a disposer. `withCleanup` stores it
      // and calls it automatically on unmount.
      return autorun(() => {
        console.log('count is', this.count);
      });
    });
  }

  @action increment(): void {
    this.count += 1;
  }

  @action decrement(): void {
    this.count -= 1;
  }
}

export const CounterScreen = observer((): JSX.Element => {
  const state = useMountStateObject(
    () => new CounterState()
  );

  return (
    <div>
      <p>Count: {state.count}</p>
      <p>Doubled: {state.doubled}</p>
      <button onClick={() => state.decrement()}>-</button>
      <button onClick={() => state.increment()}>+</button>
    </div>
  );
});
```

## Core Concepts

## `ReactStateObject`

Base class for state objects that need lifecycle and
child-state propagation.

```ts
class MyState extends ReactStateObject {
  protected mount(): void {
    // setup subscriptions, observers, timers, etc.
  }

  protected unmount(): void {
    // optional manual cleanup if needed
  }
}
```

### What it adds on top of a plain MobX class

- `mount()` and `unmount()` hooks
- nested child state object detection and recursive
  mount/unmount
- `withCleanup(...)` helper to register disposer
  functions
- `hookIntoLifecycle(...)` for advanced lifecycle
  registration

### Automatic child lifecycle propagation

In larger apps, state objects often contain smaller
ones (for example, a layout state containing an
element-size observer, a sidebar state object, and
other focused child state objects).

If a property value is another `ReactStateObject`, it is
considered a child and will mount/unmount automatically.

```ts
class FiltersState extends ReactStateObject {
  @observable accessor query = '';
}

class TableState extends ReactStateObject {
  @observable accessor filters = new FiltersState();
}

// Mounting `TableState` also mounts `filters`.
```

This makes it easy to create a tree of state objects
without manually coordinating lifecycle for every child.

## `useMountStateObject(factory, dependencies?)`

This is the React hook that creates and owns a
`ReactStateObject` instance.

```ts
const state = useMountStateObject(() => new MyState());
```

```ts
const state = useMountStateObject(
  () => new UserState(userId),
  [userId]
);
```

### What it does

- creates the instance once per component instance by
  default
- records any React hooks used by `@fromHook(...)`
  decorators during initialization
- replays those hooks on subsequent renders to preserve
  hook order
- calls the state object lifecycle (`mount` / `unmount`)
- recreates the state object when `dependencies` change
  and reruns its lifecycle

### Important rule (always)

A `ReactStateObject` should **never** be initialized
outside of `useMountStateObject(...)` when used from
React.

Always create it with:

```ts
const state = useMountStateObject(() => new MyState());
```

Do not create a `ReactStateObject` with plain `new`
inside a React component (including `useMemo`,
`useRef`, module-level singletons used as UI state, or
conditional branches).

## Lifecycle Helpers

## `withCleanup(...)` (most common)

This is the main lifecycle helper you will use.

It runs setup logic now and stores the returned cleanup
function for unmount.

```ts
protected mount(): void {
  this.withCleanup(() => {
    const id = window.setInterval(() => {
      console.log('tick');
    }, 1000);

    return () => {
      window.clearInterval(id);
    };
  });
}
```

This pattern is commonly used for:

- `autorun(...)` disposers
- DOM event listeners (`resize`, etc.)
- subscriptions / observables

## `hookIntoLifecycle(...)` (advanced)

This is a lower-level API that lets you register mount /
unmount callbacks directly.

```ts
constructor() {
  super();

  this.hookIntoLifecycle({
    onMount: () => {
      console.log('mounted');
    },
    onUnmount: () => {
      console.log('unmounted');
    },
  });
}
```

In most apps, `withCleanup(...)` is the primary
pattern; `hookIntoLifecycle(...)` exists for more
custom composition scenarios.

## MobX + React Rendering (How UI Updates)

`react-state-object` does **not** automatically make your
component reactive. React components still need to be
wrapped with MobX's `observer(...)` (or use another MobX
React integration pattern).

```tsx
import { observer } from 'mobx-react-lite';

const UserPanel = observer(() => {
  const state = useMountStateObject(() => new UserState());

  // Reading observables here makes this component react.
  return <div>{state.userName}</div>;
});
```

If you read MobX observables in a component that is not
an `observer`, React usually will not re-render when they
change.

## Using React Hooks Inside a Class (`@fromHook(...)`)

A major feature of this library is the ability to bind a
class accessor to a React hook result.

This is useful when your state object needs data from a
React hook such as:

- routing hooks (`useParams`, `useLocation`, `usePage`)
- context hooks
- feature hooks that return callbacks/services

### Basic example

```tsx
import { observable } from 'mobx';
import { useLocation } from 'react-router-dom';
import {
  fromHook,
  ReactStateObject,
} from 'react-state-object';

class RouteState extends ReactStateObject {
  @fromHook(() => useLocation())
  @observable
  accessor location!: ReturnType<typeof useLocation>;
}
```

### Example with `this` access (common app pattern)

`@fromHook(...)` can receive a function that uses the
state object instance as `this`.

This is useful when the hook needs the state object.

```tsx
class ModalState extends ReactStateObject {
  @fromHook(function (this: ModalState) {
    return useModalLauncher(this);
  })
  @observable
  accessor openModal!: () => void;
}
```

This pattern is useful when a feature state object binds
a hook-derived callback or service that needs access to
the state instance.

### Rules for `@fromHook(...)`

- Use it on `accessor` properties.
- Create the state object with `useMountStateObject(...)`.
- Keep hook usage stable (same hooks in same order across
  renders), just like normal React rules.
- Typically combine it with `@observable` when you want
  MobX reactivity on the accessor value.

### Why hook-backed accessors are excluded from child mount recursion

The library does **not** treat `@fromHook(...)` accessors
as child `ReactStateObject`s, because those values are
managed by React hooks, not by the parent state object's
child lifecycle traversal.

This keeps hook-managed values under React's lifecycle
ownership instead of treating them like nested child
state objects.

## Class Instance Injection (DI) for React Trees

This library includes a simple class-instance injection
system. It lets you bind an instance in React and then
retrieve it later by class.

This is a strong fit for sharing app-level and page-level
state (for example layout state, route/page observers,
window-size observers, and feature state) without prop
drilling.

## `InstanceInjectionRoot`

This provider stores the internal registry of class ->
React context mappings.

Put it near the top of your app (once).

```tsx
<InstanceInjectionRoot>
  <App />
</InstanceInjectionRoot>
```

## `BindInstanceForInjection`

Binds a specific class instance for descendants.

```tsx
<BindInstanceForInjection instance={appState}>
  <Children />
</BindInstanceForInjection>
```

You can nest these to provide multiple state objects.

```tsx
<InstanceInjectionRoot>
  <BindInstanceForInjection instance={appState}>
    <BindInstanceForInjection instance={sessionState}>
      <MyScreen />
    </BindInstanceForInjection>
  </BindInstanceForInjection>
</InstanceInjectionRoot>
```

## `useInjectInstance(MyClass)`

Reads the nearest instance bound for a class.
Throws if missing.

```tsx
import { observer } from 'mobx-react-lite';
import { useInjectInstance } from 'react-state-object';

const Header = observer(() => {
  const appState = useInjectInstance(AppState);

  return <h1>{appState.title}</h1>;
});
```

## `useInjectInstanceOrNull(MyClass)`

Same as `useInjectInstance(...)`, but returns `null`
instead of throwing if no bound instance exists on the
current branch.

```tsx
const maybeAppState = useInjectInstanceOrNull(AppState);
```

## `@injectInstance(...)` (Decorator)

`@injectInstance(...)` is a convenience decorator built on
`@fromHook(...)`. It injects an instance into a class
accessor.

This lets one `ReactStateObject` depend on another
without manually calling hooks in component code.

```tsx
import { observable } from 'mobx';
import {
  injectInstance,
  ReactStateObject,
} from 'react-state-object';

class AppState extends ReactStateObject {
  @observable accessor title = 'Dashboard';
}

class PageState extends ReactStateObject {
  @injectInstance(AppState)
  @observable
  accessor appState!: AppState;
}
```

This is a common pattern in larger apps, where feature
state objects inject app-level or page observer state
objects.

## End-to-End Example: App State + Page State + UI

This example combines MobX, `useMountStateObject`,
injection, and `observer(...)`.

```tsx
import { action, computed, observable } from 'mobx';
import { observer } from 'mobx-react-lite';
import {
  BindInstanceForInjection,
  injectInstance,
  InstanceInjectionRoot,
  ReactStateObject,
  useInjectInstance,
  useMountStateObject,
} from 'react-state-object';

class AppState extends ReactStateObject {
  @observable accessor appName = 'School Portal';
}

class CounterPageState extends ReactStateObject {
  @injectInstance(AppState)
  @observable
  accessor appState!: AppState;

  @observable accessor count = 0;

  @computed get title(): string {
    return `${this.appState.appName} (${this.count})`;
  }

  @action increment(): void {
    this.count += 1;
  }
}

const CounterPageBody = observer(() => {
  const pageState = useInjectInstance(CounterPageState);

  return (
    <div>
      <h2>{pageState.title}</h2>
      <button onClick={() => pageState.increment()}>
        Increment
      </button>
    </div>
  );
});

const CounterPage = observer(() => {
  const pageState = useMountStateObject(
    () => new CounterPageState()
  );

  return (
    <BindInstanceForInjection instance={pageState}>
      <CounterPageBody />
    </BindInstanceForInjection>
  );
});

export const App = () => {
  const appState = useMountStateObject(
    () => new AppState()
  );

  return (
    <InstanceInjectionRoot>
      <BindInstanceForInjection instance={appState}>
        <CounterPage />
      </BindInstanceForInjection>
    </InstanceInjectionRoot>
  );
};
```

## Example: DOM Observer State (ResizeObserver pattern)

A common pattern is using a state object to wrap browser
APIs like `ResizeObserver`.

```tsx
import { action, observable } from 'mobx';
import {
  ReactStateObject,
  useMountStateObject,
} from 'react-state-object';
import { observer } from 'mobx-react-lite';

class ElementSizeState extends ReactStateObject {
  @observable accessor width = 0;
  @observable accessor height = 0;

  private readonly resizeObserver = new ResizeObserver(
    ([entry]) => {
      if (!entry) return;
      this.setSize(
        entry.contentRect.width,
        entry.contentRect.height
      );
    }
  );

  readonly elementRef = (
    el: HTMLDivElement | null
  ): void => {
    this.resizeObserver.disconnect();
    if (el) this.resizeObserver.observe(el);
  };

  protected unmount(): void {
    this.resizeObserver.disconnect();
  }

  @action private setSize(
    width: number,
    height: number
  ): void {
    this.width = width;
    this.height = height;
  }
}

export const MeasuredPanel = observer(() => {
  const size = useMountStateObject(
    () => new ElementSizeState()
  );

  return (
    <div>
      <div ref={size.elementRef}>Resize me</div>
      <p>
        {size.width} x {size.height}
      </p>
    </div>
  );
});
```

This pattern keeps browser API setup/cleanup inside a
state class instead of scattering it across components.

## Example: Using a Hook-Derived Service in State

This mirrors a common production pattern where a state
object gets a hook-derived function (for example a toast
helper) and calls it inside an action.

```tsx
import { action, observable } from 'mobx';
import {
  fromHook,
  ReactStateObject,
} from 'react-state-object';

function useNotifier(): {
  success: (msg: string) => void;
} {
  return {
    success: (msg) => console.log('SUCCESS:', msg),
  };
}

class SaveState extends ReactStateObject {
  @observable accessor isSaving = false;

  @fromHook(() => useNotifier())
  @observable
  accessor notifier!: ReturnType<typeof useNotifier>;

  @action async save(): Promise<void> {
    this.isSaving = true;

    try {
      await new Promise((resolve) =>
        setTimeout(resolve, 300)
      );
      this.notifier.success('Saved successfully');
    } finally {
      this.isSaving = false;
    }
  }
}
```

## How This Is Commonly Used in Larger Apps (Pattern Summary)

Based on common production usage patterns, a common
structure is:

1. **App-level state objects**
   - created near app root with `useMountStateObject(...)`
   - bound with `BindInstanceForInjection`
   - examples: theme state, page observer state, window
     size observer

2. **Page-level state objects**
   - created in page/layout components
   - may inject app-level state via `@injectInstance(...)`
   - may compose nested child state objects

3. **Feature sub-state objects**
   - nested inside page state (forms, sidebar state,
     tables, save state, UI state)
   - mounted/unmounted automatically through parent
     `ReactStateObject`

4. **React components**
   - wrapped in `observer(...)`
   - either read state directly via props or retrieve it
     via `useInjectInstance(...)`

This architecture keeps React components focused on UI
while moving orchestration/subscriptions into state
classes.

Important: every `ReactStateObject` in this structure
should still be created through `useMountStateObject(...)`
at the React boundary that owns it. Child state objects
can be instantiated inside parent state object
constructors because their lifecycle is then managed by
the parent `ReactStateObject` created via
`useMountStateObject(...)`.

## API Reference

## `ReactStateObject`

Base class with lifecycle and child-state propagation.

Methods you typically override:

- `protected mount(): void`
- `protected unmount(): void`

Helpers:

- `protected withCleanup(action: () => () => void): void`
- `protected hookIntoLifecycle({ onMount?, onUnmount? })`

## `useMountStateObject(factory, dependencies?)`

Creates a `ReactStateObject` and ties it to React
component lifecycle. If `dependencies` are provided, the
state object is recreated whenever they change.

```ts
const state = useMountStateObject(() => new MyState());
```

```ts
const state = useMountStateObject(
  () => new UserState(userId),
  [userId]
);
```

This is the required creation path for `ReactStateObject`
instances used by React components.

## `fromHook(hookFn)`

Accessor decorator that assigns a React hook result to a
state object accessor.

```ts
@fromHook(() => useSomeHook())
@observable
accessor value!: ReturnType<typeof useSomeHook>;
```

## `injectInstance(Class)`

Accessor decorator that injects a class instance from the
injection tree using `useInjectInstance(...)`.

```ts
@injectInstance(AppState)
@observable
accessor appState!: AppState;
```

## `invokeReactStateObjectHook(hook)`

Low-level hook registration helper used internally by
`fromHook(...)`. Most users should not call this
manually.

## `InstanceInjectionRoot`

Root provider for the class-instance injection registry.

## `BindInstanceForInjection`

Binds an instance for descendants.

## `useInjectInstance(Class)`

Gets the nearest instance for a class or throws.

## `useInjectInstanceOrNull(Class)`

Gets the nearest instance for a class or returns `null`.

## Common Mistakes (and Fixes)

## 1) Component does not re-render when state changes

Cause:

- the component is not wrapped in `observer(...)`

Fix:

- wrap the component with `observer` from
  `mobx-react-lite`

## 2) `fromHook(...)` throws an error about

`useMountStateObject`

Cause:

- you created a `ReactStateObject` with `new MyState()`
  directly in a component instead of using
  `useMountStateObject(...)`

Fix:

- create it with `useMountStateObject(...)`

## 3) `useInjectInstance(...)` throws that no instance was

bound

Cause:

- missing `InstanceInjectionRoot`
- missing `BindInstanceForInjection`
- bound instance is on a different branch of the tree

Fix:

- add `InstanceInjectionRoot` near the app root
- ensure the consuming component is a descendant of the
  matching `BindInstanceForInjection`

## 4) Hook order errors in `fromHook(...)`

Cause:

- conditional hook usage inside `@fromHook(...)`

Fix:

- keep hook usage unconditional and stable, same as normal
  React hook rules

## Publishing / Development

### Scripts

- `npm run format`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

### Prettier config

This package copies the author's existing Prettier setup
style,
including:

- `.prettierrc`
- `.prettierignore`
- `prettier-plugin-organize-imports`
- matching `format` and `lint-staged` scripts

## License

`UNLICENSED` (update before publishing publicly if
needed).
