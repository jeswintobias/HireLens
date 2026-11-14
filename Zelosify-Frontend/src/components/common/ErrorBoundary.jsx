"use client";
import { Component } from "react";
import ErrorComponent from "./ErrorComponent";

/**
 * React error boundary: a rendering error inside `children` shows a fallback
 * instead of unmounting the whole page. Use around independent widgets (e.g.
 * each profile card) so one bad record cannot break the list.
 *
 * Props:
 * - fallback: optional (error, reset) => ReactNode for a custom/compact fallback
 * - title / message: texts for the default fallback
 * - resetKeys: when any value changes, the boundary resets automatically
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    const prev = prevProps.resetKeys || [];
    const next = this.props.resetKeys || [];
    if (
      this.state.error &&
      (prev.length !== next.length || prev.some((v, i) => !Object.is(v, next[i])))
    ) {
      this.reset();
    }
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <ErrorComponent
        title={this.props.title || "This section failed to load"}
        message={this.props.message || "An unexpected error occurred while displaying this content."}
        onRetry={this.reset}
      />
    );
  }
}
