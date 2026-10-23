import { Component, type PropsWithChildren } from 'react';
import { rememberDiagnosticContext } from '@/utils/diagnosticContext';
import type { DiagnosticContext } from '@/utils/errorDiagnostics';

type DiagnosticScopeProps = PropsWithChildren<{
  context: DiagnosticContext;
}>;

type DiagnosticScopeState = {
  failed: boolean;
  error: unknown;
};

/** Annotate render failures; the enclosing app boundary owns reporting/retry. */
export class DiagnosticScope extends Component<
  DiagnosticScopeProps,
  DiagnosticScopeState
> {
  state: DiagnosticScopeState = { failed: false, error: undefined };

  static getDerivedStateFromError(error: unknown): DiagnosticScopeState {
    return { failed: true, error };
  }

  render() {
    if (this.state.failed) {
      rememberDiagnosticContext(this.state.error, this.props.context);
      // Rethrow during render so the ancestor boundary receives the same error.
      throw this.state.error;
    }
    return this.props.children;
  }
}
