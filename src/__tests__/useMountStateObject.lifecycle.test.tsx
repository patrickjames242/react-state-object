import { render } from '@testing-library/react';
import { observable } from 'mobx';
import React from 'react';
import {
  mountStateObject,
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

class MarkedAccessorParentState extends ReactStateObject {
  @mountStateObject
  @observable
  accessor child: ChildState;

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

class ObservableFirstMarkedAccessorParentState extends ReactStateObject {
  @observable
  @mountStateObject
  accessor child: ChildState;

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

class MarkedFieldParentState extends ReactStateObject {
  @mountStateObject
  child: ChildState;

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

class UnmarkedParentState extends ReactStateObject {
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

function renderState(
  createState: () => ReactStateObject
) {
  return render(<TestHarness createState={createState} />);
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

describe('useMountStateObject lifecycle with explicit child state', () => {
  it('calls mount on the parent state object', () => {
    const parentMountSpy = jest.fn();
    const parentUnmountSpy = jest.fn();
    const childMountSpy = jest.fn();
    const childUnmountSpy = jest.fn();

    renderState(
      () =>
        new MarkedAccessorParentState(
          parentMountSpy,
          parentUnmountSpy,
          childMountSpy,
          childUnmountSpy
        )
    );

    expect(parentMountSpy).toHaveBeenCalledTimes(1);
  });

  it('calls mount on a marked @observable accessor child state object', () => {
    const parentMountSpy = jest.fn();
    const parentUnmountSpy = jest.fn();
    const childMountSpy = jest.fn();
    const childUnmountSpy = jest.fn();

    renderState(
      () =>
        new MarkedAccessorParentState(
          parentMountSpy,
          parentUnmountSpy,
          childMountSpy,
          childUnmountSpy
        )
    );

    expect(childMountSpy).toHaveBeenCalledTimes(1);
  });

  it('calls unmount on a marked @observable accessor child state object', () => {
    const parentMountSpy = jest.fn();
    const parentUnmountSpy = jest.fn();
    const childMountSpy = jest.fn();
    const childUnmountSpy = jest.fn();

    const { unmount } = renderState(
      () =>
        new MarkedAccessorParentState(
          parentMountSpy,
          parentUnmountSpy,
          childMountSpy,
          childUnmountSpy
        )
    );

    unmount();

    expect(childUnmountSpy).toHaveBeenCalledTimes(1);
  });

  it('mounts a child when @mountStateObject is placed after @observable', () => {
    const parentMountSpy = jest.fn();
    const parentUnmountSpy = jest.fn();
    const childMountSpy = jest.fn();
    const childUnmountSpy = jest.fn();

    renderState(
      () =>
        new ObservableFirstMarkedAccessorParentState(
          parentMountSpy,
          parentUnmountSpy,
          childMountSpy,
          childUnmountSpy
        )
    );

    expect(parentMountSpy).toHaveBeenCalledTimes(1);
    expect(childMountSpy).toHaveBeenCalledTimes(1);
  });

  it('unmounts a child when @mountStateObject is placed after @observable', () => {
    const parentMountSpy = jest.fn();
    const parentUnmountSpy = jest.fn();
    const childMountSpy = jest.fn();
    const childUnmountSpy = jest.fn();

    const { unmount } = renderState(
      () =>
        new ObservableFirstMarkedAccessorParentState(
          parentMountSpy,
          parentUnmountSpy,
          childMountSpy,
          childUnmountSpy
        )
    );

    unmount();

    expect(parentUnmountSpy).toHaveBeenCalledTimes(1);
    expect(childUnmountSpy).toHaveBeenCalledTimes(1);
  });

  it('mounts and unmounts a marked field child state object', () => {
    const parentMountSpy = jest.fn();
    const parentUnmountSpy = jest.fn();
    const childMountSpy = jest.fn();
    const childUnmountSpy = jest.fn();

    const { unmount } = renderState(
      () =>
        new MarkedFieldParentState(
          parentMountSpy,
          parentUnmountSpy,
          childMountSpy,
          childUnmountSpy
        )
    );

    expect(childMountSpy).toHaveBeenCalledTimes(1);

    unmount();

    expect(childUnmountSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores unmarked ReactStateObject properties during mount and unmount', () => {
    const parentMountSpy = jest.fn();
    const parentUnmountSpy = jest.fn();
    const childMountSpy = jest.fn();
    const childUnmountSpy = jest.fn();

    const { unmount } = renderState(
      () =>
        new UnmarkedParentState(
          parentMountSpy,
          parentUnmountSpy,
          childMountSpy,
          childUnmountSpy
        )
    );

    expect(parentMountSpy).toHaveBeenCalledTimes(1);
    expect(childMountSpy).not.toHaveBeenCalled();

    unmount();

    expect(parentUnmountSpy).toHaveBeenCalledTimes(1);
    expect(childUnmountSpy).not.toHaveBeenCalled();
  });

  it('throws on mount when two marked properties on the same parent share a child instance', () => {
    class DuplicateSiblingParentState extends ReactStateObject {
      @mountStateObject
      firstChild: ChildState;

      @mountStateObject
      secondChild: ChildState;

      constructor(sharedChild: ChildState) {
        super();
        this.firstChild = sharedChild;
        this.secondChild = sharedChild;
      }
    }

    expect(() =>
      renderState(
        () =>
          new DuplicateSiblingParentState(
            new ChildState(jest.fn(), jest.fn())
          )
      )
    ).toThrow(
      /Duplicate child state object detected during mount/
    );
  });

  it('throws on mount when a nested tree shares a marked child instance', () => {
    class NestedParentState extends ReactStateObject {
      @mountStateObject
      child: ChildState;

      constructor(child: ChildState) {
        super();
        this.child = child;
      }
    }

    class RootState extends ReactStateObject {
      @mountStateObject
      left: NestedParentState;

      @mountStateObject
      right: NestedParentState;

      constructor(sharedChild: ChildState) {
        super();
        this.left = new NestedParentState(sharedChild);
        this.right = new NestedParentState(sharedChild);
      }
    }

    expect(() =>
      renderState(
        () => new RootState(new ChildState(jest.fn(), jest.fn()))
      )
    ).toThrow(
      /Duplicate child state object detected during mount/
    );
  });

  it('throws on unmount when a marked child reference becomes duplicated later', () => {
    class NestedParentState extends ReactStateObject {
      @mountStateObject
      child: ChildState;

      constructor(child: ChildState) {
        super();
        this.child = child;
      }
    }

    class MutableRootState extends ReactStateObject {
      @mountStateObject
      left: NestedParentState;

      @mountStateObject
      right: NestedParentState;

      constructor() {
        super();
        this.left = new NestedParentState(
          new ChildState(jest.fn(), jest.fn())
        );
        this.right = new NestedParentState(
          new ChildState(jest.fn(), jest.fn())
        );
      }
    }

    let rootState!: MutableRootState;
    const { unmount } = renderState(() => {
      rootState = new MutableRootState();
      return rootState;
    });

    rootState.right.child = rootState.left.child;

    expect(() => unmount()).toThrow(
      /Duplicate child state object detected during unmount/
    );
  });

  it('throws on mount when a marked property is not a ReactStateObject', () => {
    class InvalidChildState extends ReactStateObject {
      @mountStateObject
      child: unknown = null;
    }

    expect(() =>
      renderState(() => new InvalidChildState())
    ).toThrow(
      /Invalid @mountStateObject property InvalidChildState\.child during mount/
    );
  });

  it('throws on unmount when a marked property stops being a ReactStateObject', () => {
    class MutableChildParentState extends ReactStateObject {
      @mountStateObject
      child: ChildState | unknown;

      constructor() {
        super();
        this.child = new ChildState(jest.fn(), jest.fn());
      }
    }

    let parentState!: MutableChildParentState;
    const { unmount } = renderState(() => {
      parentState = new MutableChildParentState();
      return parentState;
    });

    parentState.child = null;

    expect(() => unmount()).toThrow(
      /Invalid @mountStateObject property MutableChildParentState\.child during unmount/
    );
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
