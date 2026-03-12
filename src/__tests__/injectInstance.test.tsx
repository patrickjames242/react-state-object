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

function renderInjectedState<TState extends ReactStateObject>({
  createState,
  initialRootState,
}: {
  createState: () => TState;
  initialRootState: ReactStateObject;
}): {
  clickUpdate: () => void;
  getStateObject: () => TState;
} {
  let stateObject: TState | undefined;

  function CaptureStateHarness(): JSX.Element | null {
    stateObject = useMountStateObject(createState);
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
          <TestHarness
            createState={() => new ChildState()}
          />
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
          <TestHarness
            createState={() => new ChildState()}
          />
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
      createState: () => new ObservableInjectedState(),
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
        createState: () => new ObservableInjectedState(),
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
      createState: () => new RefInjectedState(),
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
        createState: () => new RefInjectedState(),
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
});
