import { act, render } from '@testing-library/react';
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
});
