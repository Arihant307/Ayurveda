import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IndicatorList } from "@/components/IndicatorList";
import { ConfusionMatrix } from "@/components/charts";
import { EmptyState, ErrorState, Loading, RiskMeter, SeverityBadge, SimulatedBadge } from "@/components/ui";

afterEach(cleanup);

describe("states", () => {
  it("loading state is announced", () => {
    render(<Loading label="Loading alerts" />);
    expect(screen.getByRole("status").textContent).toContain("Loading alerts");
  });

  it("error state shows the message and retries", () => {
    const retry = vi.fn();
    render(<ErrorState error="Cannot reach the API server" onRetry={retry} />);
    expect(screen.getByRole("alert").textContent).toContain("Cannot reach the API server");
    fireEvent.click(screen.getByText("Retry"));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("empty state", () => {
    render(<EmptyState title="No alerts match these filters">Clear filters</EmptyState>);
    expect(screen.getByText("No alerts match these filters")).toBeTruthy();
  });
});

describe("success rendering", () => {
  it("severity is conveyed by text and icon, not colour alone", () => {
    const { container } = render(<SeverityBadge severity="critical" />);
    expect(container.textContent).toBe("Critical");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("risk meter exposes its value", () => {
    render(<RiskMeter score={0.873} threshold={0.43} />);
    const meter = screen.getByRole("meter");
    expect(meter.getAttribute("aria-valuenow")).toBe("87");
    expect(screen.getByText("87.3%")).toBeTruthy();
  });

  it("indicators list evidence, or an empty message", () => {
    const { rerender } = render(<IndicatorList items={[{ code: "ip_link", severity: "high", description: "Links point to IPs", evidence: "203.0.113.9" }]} empty="none" />);
    expect(screen.getByText("Links point to IPs")).toBeTruthy();
    expect(screen.getByText("203.0.113.9")).toBeTruthy();
    rerender(<IndicatorList items={[]} empty="No indicators matched." />);
    expect(screen.getByText("No indicators matched.")).toBeTruthy();
  });

  it("simulated data is labelled", () => {
    render(<SimulatedBadge />);
    expect(screen.getByText("Simulated")).toBeTruthy();
  });

  it("confusion matrix renders an accessible table", () => {
    render(<ConfusionMatrix labels={["benign", "dos"]} matrix={[[90, 10], [5, 95]]} />);
    expect(screen.getAllByRole("columnheader").length).toBe(3);
    expect(screen.getByTitle("Benign → DoS: 10 (10.0%)")).toBeTruthy();
  });
});
