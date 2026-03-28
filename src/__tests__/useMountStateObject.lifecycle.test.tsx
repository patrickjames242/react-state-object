import { render } from '@testing-library/react';
import { observable } from 'mobx';
import React from 'react';
import {
  ReactStateObject,
  useMountStateObject,
} from '../ReactStateObject';

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

class IdentifiedState extends ReactStateObject {
  constructor(
    readonly id: string,
    private readonly onMountSpy: jest.Mock,
    private readonly onUnmountSpy: jest.Mock
  ) {
    super();
  }

  protected override mount(): void {
    this.onMountSpy(this.id);
  }

  protected override unmount(): void {
    this.onUnmountSpy(this.id);
  }
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

  it('recreates the state object and reruns lifecycle when dependencies change', () => {
    const mountSpy = jest.fn();
    const unmountSpy = jest.fn();
    const observedStates: IdentifiedState[] = [];

    function TestDependencyHarness({
      stateId,
    }: {
      stateId: string;
    }): JSX.Element | null {
      const state = useMountStateObject(
        () =>
          new IdentifiedState(
            stateId,
            mountSpy,
            unmountSpy
          ),
        [stateId]
      );

      observedStates.push(state);
      return null;
    }

    const { rerender } = render(
      <TestDependencyHarness stateId="first" />
    );

    rerender(<TestDependencyHarness stateId="second" />);

    expect(observedStates[0]?.id).toBe('first');
    expect(observedStates[1]?.id).toBe('second');
    expect(observedStates[0]).not.toBe(observedStates[1]);
    expect(mountSpy).toHaveBeenNthCalledWith(1, 'first');
    expect(unmountSpy).toHaveBeenNthCalledWith(1, 'first');
    expect(mountSpy).toHaveBeenNthCalledWith(2, 'second');
    expect(unmountSpy).toHaveBeenCalledTimes(1);
  });

  it('retains the same state object when dependencies do not change', () => {
    const mountSpy = jest.fn();
    const unmountSpy = jest.fn();
    const createState = jest.fn(
      (stateId: string) =>
        new IdentifiedState(
          stateId,
          mountSpy,
          unmountSpy
        )
    );
    const observedStates: IdentifiedState[] = [];

    function TestDependencyHarness({
      stateId,
    }: {
      stateId: string;
    }): JSX.Element | null {
      const state = useMountStateObject(
        () => createState(stateId),
        [stateId]
      );

      observedStates.push(state);
      return null;
    }

    const { rerender } = render(
      <TestDependencyHarness stateId="same" />
    );

    rerender(<TestDependencyHarness stateId="same" />);

    expect(observedStates[0]).toBe(observedStates[1]);
    expect(createState).toHaveBeenCalledTimes(1);
    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(unmountSpy).not.toHaveBeenCalled();
  });

  it('retains the same state object across rerenders when no dependency array is provided', () => {
    const mountSpy = jest.fn();
    const unmountSpy = jest.fn();
    const createState = jest.fn(
      (stateId: string) =>
        new IdentifiedState(
          stateId,
          mountSpy,
          unmountSpy
        )
    );
    const observedStates: IdentifiedState[] = [];

    function TestDependencyHarness({
      stateId,
    }: {
      stateId: string;
    }): JSX.Element | null {
      const state = useMountStateObject(() =>
        createState(stateId)
      );

      observedStates.push(state);
      return null;
    }

    const { rerender } = render(
      <TestDependencyHarness stateId="first" />
    );

    rerender(<TestDependencyHarness stateId="second" />);

    expect(observedStates[0]).toBe(observedStates[1]);
    expect(observedStates[0]?.id).toBe('first');
    expect(observedStates[1]?.id).toBe('first');
    expect(createState).toHaveBeenCalledTimes(1);
    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(unmountSpy).not.toHaveBeenCalled();
  });
});
