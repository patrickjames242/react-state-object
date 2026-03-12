import { render } from '@testing-library/react';
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
});
