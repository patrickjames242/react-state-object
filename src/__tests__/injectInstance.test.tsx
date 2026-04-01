import { act, render } from '@testing-library/react';
import {
  autorun,
  isObservableProp,
  observable,
} from 'mobx';
import React from 'react';
import {
  BindInstanceForInjection,
  InstanceInjectionRoot,
} from '../InstanceInjectionSystem';
import {
  injectInstance,
  mountStateObject,
  ReactStateObject,
  type StateObjectClass,
  useMountStateObject,
} from '../ReactStateObject';

function TestHarness({
  StateObjectClass,
}: {
  StateObjectClass: StateObjectClass<ReactStateObject>;
}): JSX.Element | null {
  useMountStateObject(StateObjectClass);
  return null;
}

function renderInjectedState<TState extends ReactStateObject>({
  StateObjectClass,
  initialRootState,
}: {
  StateObjectClass: StateObjectClass<TState>;
  initialRootState: ReactStateObject;
}): {
  clickUpdate: () => void;
  getStateObject: () => TState;
} {
  let stateObject: TState | undefined;

  function CaptureStateHarness(): JSX.Element | null {
    stateObject = useMountStateObject(StateObjectClass);
    return null;
  }

  function TestContainer(): JSX.Element {
    const [rootState, setRootState] = React.useState(
      initialRootState
    );

    return (
      <>
        <button
          onClick={() =>
            setRootState(
              new (initialRootState.constructor as new (
                label: string
              ) => ReactStateObject)('second')
            )
          }
          type="button"
        >
          update root
        </button>
        <BindInstanceForInjection instance={rootState}>
          <CaptureStateHarness />
        </BindInstanceForInjection>
      </>
    );
  }

  const { getByRole } = render(
    <InstanceInjectionRoot>
      <TestContainer />
    </InstanceInjectionRoot>
  );

  return {
    clickUpdate() {
      act(() => {
        getByRole('button', {
          name: 'update root',
        }).click();
      });
    },
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

describe('injectInstance', () => {
  it('makes injectInstance values available inside the subclass constructor', () => {
    const constructorSpy = jest.fn();

    class RootState extends ReactStateObject {}

    class ChildState extends ReactStateObject {
      @injectInstance(RootState)
      accessor rootState!: RootState;

      constructor() {
        super();
        constructorSpy(this.rootState);
      }
    }

    const rootState = new RootState();

    render(
      <InstanceInjectionRoot>
        <BindInstanceForInjection instance={rootState}>
          <TestHarness StateObjectClass={ChildState} />
        </BindInstanceForInjection>
      </InstanceInjectionRoot>
    );

    expect(constructorSpy).toHaveBeenCalledWith(
      rootState
    );
  });

  it('makes injectInstance values available to later constructor property initializers', () => {
    const constructorSpy = jest.fn();

    class RootState extends ReactStateObject {}

    class ChildState extends ReactStateObject {
      @injectInstance(RootState)
      accessor rootState!: RootState;

      laterValue = this.rootState;

      constructor() {
        super();
        constructorSpy(this.laterValue);
      }
    }

    const rootState = new RootState();

    render(
      <InstanceInjectionRoot>
        <BindInstanceForInjection instance={rootState}>
          <TestHarness StateObjectClass={ChildState} />
        </BindInstanceForInjection>
      </InstanceInjectionRoot>
    );

    expect(constructorSpy).toHaveBeenCalledWith(
      rootState
    );
  });

  it('sets @observable injectInstance accessors and keeps them observable', () => {
    class RootState extends ReactStateObject {
      constructor(public readonly label: string) {
        super();
      }
    }

    class ObservableInjectedState extends ReactStateObject {
      @observable
      @injectInstance(RootState)
      accessor rootState!: RootState;
    }

    const { getStateObject } = renderInjectedState({
      StateObjectClass: ObservableInjectedState,
      initialRootState: new RootState('first'),
    });
    const stateObject = getStateObject();

    expect(
      isObservableProp(stateObject, 'rootState')
    ).toBe(true);
    expect(stateObject.rootState.label).toBe('first');
  });

  it('notifies autorun when an @observable injectInstance accessor changes', () => {
    class RootState extends ReactStateObject {
      constructor(public readonly label: string) {
        super();
      }
    }

    class ObservableInjectedState extends ReactStateObject {
      @observable
      @injectInstance(RootState)
      accessor rootState!: RootState;
    }

    const observedLabels: string[] = [];
    const { clickUpdate, getStateObject } =
      renderInjectedState({
        StateObjectClass: ObservableInjectedState,
        initialRootState: new RootState('first'),
      });
    const stateObject = getStateObject();

    const dispose = autorun(() => {
      observedLabels.push(stateObject.rootState.label);
    });

    clickUpdate();

    expect(stateObject.rootState.label).toBe('second');
    expect(observedLabels).toEqual([
      'first',
      'second',
    ]);

    dispose();
  });

  it('sets @observable.ref injectInstance accessors and preserves the injected reference', () => {
    class RootState extends ReactStateObject {
      constructor(public readonly label: string) {
        super();
      }
    }

    class RefInjectedState extends ReactStateObject {
      @observable.ref
      @injectInstance(RootState)
      accessor rootState!: RootState;
    }

    const initialRootState = new RootState('first');
    const { getStateObject } = renderInjectedState({
      StateObjectClass: RefInjectedState,
      initialRootState,
    });
    const stateObject = getStateObject();

    expect(
      isObservableProp(stateObject, 'rootState')
    ).toBe(true);
    expect(stateObject.rootState).toBe(initialRootState);
  });

  it('notifies autorun when an @observable.ref injectInstance accessor changes', () => {
    class RootState extends ReactStateObject {
      constructor(public readonly label: string) {
        super();
      }
    }

    class RefInjectedState extends ReactStateObject {
      @observable.ref
      @injectInstance(RootState)
      accessor rootState!: RootState;
    }

    const observedValues: RootState[] = [];
    const { clickUpdate, getStateObject } =
      renderInjectedState({
        StateObjectClass: RefInjectedState,
        initialRootState: new RootState('first'),
      });
    const stateObject = getStateObject();

    const dispose = autorun(() => {
      observedValues.push(stateObject.rootState);
    });

    clickUpdate();

    expect(observedValues).toHaveLength(2);
    expect(observedValues[0]).not.toBe(observedValues[1]);
    expect(observedValues[1]).toBe(stateObject.rootState);
    expect(stateObject.rootState.label).toBe('second');

    dispose();
  });

  it('returns null when optional injectInstance has no bound instance', () => {
    const constructorSpy = jest.fn();

    class MissingRootState extends ReactStateObject {}

    class OptionalInjectedState extends ReactStateObject {
      @injectInstance(MissingRootState, {
        optional: true,
      })
      accessor rootState: MissingRootState | null = null;

      constructor() {
        super();
        constructorSpy(this.rootState);
      }
    }

    render(
      <InstanceInjectionRoot>
        <TestHarness
          StateObjectClass={OptionalInjectedState}
        />
      </InstanceInjectionRoot>
    );

    expect(constructorSpy).toHaveBeenCalledWith(null);
  });

  it('returns the bound instance when optional injectInstance is available', () => {
    const constructorSpy = jest.fn();

    class RootState extends ReactStateObject {}

    class OptionalInjectedState extends ReactStateObject {
      @injectInstance(RootState, {
        optional: true,
      })
      accessor rootState: RootState | null = null;

      constructor() {
        super();
        constructorSpy(this.rootState);
      }
    }

    const rootState = new RootState();

    render(
      <InstanceInjectionRoot>
        <BindInstanceForInjection instance={rootState}>
          <TestHarness
            StateObjectClass={OptionalInjectedState}
          />
        </BindInstanceForInjection>
      </InstanceInjectionRoot>
    );

    expect(constructorSpy).toHaveBeenCalledWith(
      rootState
    );
  });

  it('does not mount an injected ReactStateObject unless it is explicitly marked as a child', () => {
    const rootMountSpy = jest.fn();
    const rootUnmountSpy = jest.fn();
    const childMountSpy = jest.fn();
    const childUnmountSpy = jest.fn();

    class RootState extends ReactStateObject {
      protected override mount(): void {
        rootMountSpy();
      }

      protected override unmount(): void {
        rootUnmountSpy();
      }
    }

    class ChildState extends ReactStateObject {
      @injectInstance(RootState)
      accessor rootState!: RootState;

      protected override mount(): void {
        childMountSpy();
      }

      protected override unmount(): void {
        childUnmountSpy();
      }
    }

    const rootState = new RootState();
    const { unmount } = render(
      <InstanceInjectionRoot>
        <BindInstanceForInjection instance={rootState}>
          <TestHarness StateObjectClass={ChildState} />
        </BindInstanceForInjection>
      </InstanceInjectionRoot>
    );

    expect(childMountSpy).toHaveBeenCalledTimes(1);
    expect(rootMountSpy).not.toHaveBeenCalled();

    unmount();

    expect(childUnmountSpy).toHaveBeenCalledTimes(1);
    expect(rootUnmountSpy).not.toHaveBeenCalled();
  });

  it('mounts an injected ReactStateObject when it is explicitly marked as a child', () => {
    const rootMountSpy = jest.fn();
    const childMountSpy = jest.fn();

    class RootState extends ReactStateObject {
      protected override mount(): void {
        rootMountSpy();
      }
    }

    class ChildState extends ReactStateObject {
      @mountStateObject
      @injectInstance(RootState)
      accessor rootState!: RootState;

      protected override mount(): void {
        childMountSpy();
      }
    }

    const rootState = new RootState();

    render(
      <InstanceInjectionRoot>
        <BindInstanceForInjection instance={rootState}>
          <TestHarness StateObjectClass={ChildState} />
        </BindInstanceForInjection>
      </InstanceInjectionRoot>
    );

    expect(rootMountSpy).toHaveBeenCalledTimes(1);
    expect(childMountSpy).toHaveBeenCalledTimes(1);
  });
});
