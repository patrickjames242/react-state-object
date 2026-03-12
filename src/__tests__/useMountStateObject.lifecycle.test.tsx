import { render } from '@testing-library/react';
import { observable } from 'mobx';
import React from 'react';
import {
  fromHook,
  injectInstance,
  ReactStateObject,
  useMountStateObject,
} from '../ReactStateObject';
import {
  BindInstanceForInjection,
  InstanceInjectionRoot,
} from '../InstanceInjectionSystem';

class ChildState extends ReactStateObject {
  constructor(
    private readonly onMountSpy: jest.Mock,
    private readonly onUnmountSpy: jest.Mock
  ) {
    super();
  }

  protected override mount(): void {
    this.onMountSpy();
  }

  protected override unmount(): void {
    this.onUnmountSpy();
  }
}

class ParentState extends ReactStateObject {
  @observable accessor child: ChildState;

  constructor(
    private readonly onMountSpy: jest.Mock,
    private readonly onUnmountSpy: jest.Mock,
    childMountSpy: jest.Mock,
    childUnmountSpy: jest.Mock
  ) {
    super();
    this.child = new ChildState(childMountSpy, childUnmountSpy);
  }

  protected override mount(): void {
    this.onMountSpy();
  }

  protected override unmount(): void {
    this.onUnmountSpy();
  }
}

function TestHarness({
  createState,
}: {
  createState: () => ReactStateObject;
}): JSX.Element | null {
  useMountStateObject(createState);
  return null;
}

function renderParentState() {
  const parentMountSpy = jest.fn();
  const parentUnmountSpy = jest.fn();
  const childMountSpy = jest.fn();
  const childUnmountSpy = jest.fn();

  const renderResult = render(
    <TestHarness
      createState={() =>
        new ParentState(
          parentMountSpy,
          parentUnmountSpy,
          childMountSpy,
          childUnmountSpy
        )
      }
    />
  );

  return {
    ...renderResult,
    parentMountSpy,
    parentUnmountSpy,
    childMountSpy,
    childUnmountSpy,
  };
}

describe('useMountStateObject lifecycle with observable child state', () => {
  it('calls mount on the parent state object', () => {
    const { parentMountSpy } = renderParentState();

    expect(parentMountSpy).toHaveBeenCalledTimes(1);
  });

  it('calls mount on the @observable child state object instance', () => {
    const { childMountSpy } = renderParentState();

    expect(childMountSpy).toHaveBeenCalledTimes(1);
  });

  it('calls unmount on the parent state object', () => {
    const { unmount, parentUnmountSpy } = renderParentState();

    unmount();

    expect(parentUnmountSpy).toHaveBeenCalledTimes(1);
  });

  it('calls unmount on the @observable child state object instance', () => {
    const { unmount, childUnmountSpy } = renderParentState();

    unmount();

    expect(childUnmountSpy).toHaveBeenCalledTimes(1);
  });

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
