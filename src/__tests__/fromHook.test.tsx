import { act, render } from '@testing-library/react';
import {
  autorun,
  isObservable,
  isObservableProp,
  observable,
} from 'mobx';
import React from 'react';
import {
  fromHook,
  ReactStateObject,
  useMountStateObject,
} from '../ReactStateObject';

function TestHarness({
  createState,
}: {
  createState: () => ReactStateObject;
}): JSX.Element | null {
  useMountStateObject(createState);
  return null;
}

function renderFromHookState<
  TState extends ReactStateObject,
>(
  createState: () => TState
): { getStateObject: () => TState } {
  let stateObject: TState | undefined;

  function CaptureStateHarness(): JSX.Element | null {
    stateObject = useMountStateObject(createState);
    return null;
  }

  render(<CaptureStateHarness />);

  return {
    getStateObject(): TState {
      if (!stateObject) {
        throw new Error(
          'Expected state object to be initialized'
        );
      }

      return stateObject;
    },
  };
}

describe('fromHook', () => {
  it('makes fromHook values available inside the subclass constructor', () => {
    const constructorSpy = jest.fn();

    function useHookValue(): string {
      return 'hook-value';
    }

    class HookState extends ReactStateObject {
      @fromHook(() => useHookValue())
      accessor hookValue!: string;

      constructor() {
        super();
        constructorSpy(this.hookValue);
      }
    }

    render(
      <TestHarness createState={() => new HookState()} />
    );

    expect(constructorSpy).toHaveBeenCalledWith(
      'hook-value'
    );
  });

  it('makes fromHook values available to later constructor property initializers', () => {
    const constructorSpy = jest.fn();

    function useHookValue(): string {
      return 'hook-value';
    }

    class HookState extends ReactStateObject {
      @fromHook(() => useHookValue())
      accessor hookValue!: string;

      laterValue = this.hookValue;

      constructor() {
        super();
        constructorSpy(this.laterValue);
      }
    }

    render(
      <TestHarness createState={() => new HookState()} />
    );

    expect(constructorSpy).toHaveBeenCalledWith(
      'hook-value'
    );
  });

  it('updates the class property when the backing hook rerenders with a new value', () => {
    let setHookValue:
      | React.Dispatch<React.SetStateAction<string>>
      | undefined;
    let stateObject: HookState | undefined;

    function useHookValue(): string {
      const [value, setValue] = React.useState('first');
      setHookValue = setValue;
      return value;
    }

    class HookState extends ReactStateObject {
      @fromHook(() => useHookValue())
      accessor hookValue!: string;
    }

    function CaptureStateHarness(): JSX.Element | null {
      stateObject = useMountStateObject(
        () => new HookState()
      );
      return null;
    }

    render(<CaptureStateHarness />);

    expect(stateObject?.hookValue).toBe('first');

    act(() => {
      setHookValue?.('second');
    });

    expect(stateObject?.hookValue).toBe('second');
  });

  it('sets @observable fromHook accessors and keeps the assigned value observable', () => {
    let setHookValue:
      | React.Dispatch<
          React.SetStateAction<{ label: string }>
        >
      | undefined;

    function useHookValue(): { label: string } {
      const [value, setValue] = React.useState({
        label: 'first',
      });
      setHookValue = setValue;
      return value;
    }

    class ObservableHookState extends ReactStateObject {
      @observable
      @fromHook(() => useHookValue())
      accessor hookValue!: { label: string };
    }

    const { getStateObject } = renderFromHookState(
      () => new ObservableHookState()
    );
    const stateObject = getStateObject();

    expect(isObservableProp(stateObject, 'hookValue')).toBe(
      true
    );
    expect(isObservable(stateObject.hookValue)).toBe(true);
    expect(stateObject.hookValue.label).toBe('first');
  });

  it('notifies autorun when an @observable fromHook accessor changes on rerender', () => {
    let setHookValue:
      | React.Dispatch<
          React.SetStateAction<{ label: string }>
        >
      | undefined;
    const observedLabels: string[] = [];

    function useHookValue(): { label: string } {
      const [value, setValue] = React.useState({
        label: 'first',
      });
      setHookValue = setValue;
      return value;
    }

    class ObservableHookState extends ReactStateObject {
      @observable
      @fromHook(() => useHookValue())
      accessor hookValue!: { label: string };
    }

    const { getStateObject } = renderFromHookState(
      () => new ObservableHookState()
    );
    const stateObject = getStateObject();

    const dispose = autorun(() => {
      observedLabels.push(stateObject.hookValue.label);
    });

    act(() => {
      setHookValue?.({ label: 'second' });
    });

    expect(stateObject.hookValue.label).toBe('second');
    expect(observedLabels).toEqual(['first', 'second']);

    dispose();
  });

  it('notifies autorun when an outer @fromHook wraps an @observable accessor on rerender', () => {
    let setHookValue:
      | React.Dispatch<
          React.SetStateAction<{ label: string }>
        >
      | undefined;
    const observedLabels: string[] = [];

    function useHookValue(): { label: string } {
      const [value, setValue] = React.useState({
        label: 'first',
      });
      setHookValue = setValue;
      return value;
    }

    class ObservableHookState extends ReactStateObject {
      @fromHook(() => useHookValue())
      @observable
      accessor hookValue!: { label: string };
    }

    const { getStateObject } = renderFromHookState(
      () => new ObservableHookState()
    );
    const stateObject = getStateObject();

    const dispose = autorun(() => {
      observedLabels.push(stateObject.hookValue.label);
    });

    act(() => {
      setHookValue?.({ label: 'second' });
    });

    expect(stateObject.hookValue.label).toBe('second');
    expect(observedLabels).toEqual(['first', 'second']);

    dispose();
  });

  it('sets @observable.ref fromHook accessors and preserves the assigned reference', () => {
    let initialValue: { label: string } | undefined;

    function useHookValue(): { label: string } {
      const [value] = React.useState(() => {
        const initial = { label: 'first' };
        initialValue = initial;
        return initial;
      });
      return value;
    }

    class RefHookState extends ReactStateObject {
      @observable.ref
      @fromHook(() => useHookValue())
      accessor hookValue!: { label: string };
    }

    const { getStateObject } = renderFromHookState(
      () => new RefHookState()
    );
    const stateObject = getStateObject();

    expect(isObservableProp(stateObject, 'hookValue')).toBe(
      true
    );
    expect(stateObject.hookValue).toBe(initialValue);
  });

  it('notifies autorun when an @observable.ref fromHook accessor changes on rerender', () => {
    let setHookValue:
      | React.Dispatch<
          React.SetStateAction<{ label: string }>
        >
      | undefined;
    const observedLabels: string[] = [];

    function useHookValue(): { label: string } {
      const [value, setValue] = React.useState({
        label: 'first',
      });
      setHookValue = setValue;
      return value;
    }

    class RefHookState extends ReactStateObject {
      @fromHook(() => useHookValue())
      @observable.ref
      accessor hookValue!: { label: string };
    }

    const { getStateObject } = renderFromHookState(
      () => new RefHookState()
    );
    const stateObject = getStateObject();

    const dispose = autorun(() => {
      observedLabels.push(stateObject.hookValue.label);
    });

    let nextValue: { label: string } | undefined;

    act(() => {
      nextValue = { label: 'second' };
      setHookValue?.(nextValue);
    });

    expect(stateObject.hookValue).toBe(nextValue);
    expect(observedLabels).toEqual(['first', 'second']);

    dispose();
  });

  it('notifies autorun when an outer @observable.ref wraps a fromHook accessor on rerender', () => {
    let setHookValue:
      | React.Dispatch<
          React.SetStateAction<{ label: string }>
        >
      | undefined;
    const observedLabels: string[] = [];

    function useHookValue(): { label: string } {
      const [value, setValue] = React.useState({
        label: 'first',
      });
      setHookValue = setValue;
      return value;
    }

    class RefHookState extends ReactStateObject {
      @observable.ref
      @fromHook(() => useHookValue())
      accessor hookValue!: { label: string };
    }

    const { getStateObject } = renderFromHookState(
      () => new RefHookState()
    );
    const stateObject = getStateObject();

    const dispose = autorun(() => {
      observedLabels.push(stateObject.hookValue.label);
    });

    let nextValue: { label: string } | undefined;

    act(() => {
      nextValue = { label: 'second' };
      setHookValue?.(nextValue);
    });

    expect(stateObject.hookValue).toBe(nextValue);
    expect(observedLabels).toEqual(['first', 'second']);

    dispose();
  });
});
