import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SystemInfoPanel } from "./SystemInfoPanel";
import { SOLAR_SYSTEMS } from "../../lib/solarSystems";
import { formatCoordLy } from "../../lib/galaxyMap";

// System 30000001 "A 2560" is the first entry in solar-systems.json and is
// guaranteed to be present in the static data loaded by solarSystems.ts.
const KNOWN_SYSTEM_ID = 30000001;
const KNOWN_SYSTEM_NAME = "A 2560";

describe("SystemInfoPanel", () => {
  it("shows empty-state prompt when no system is selected", () => {
    render(<SystemInfoPanel selectedSystemId={null} />);
    expect(screen.getByText(/select a solar system/i)).toBeInTheDocument();
  });

  it("shows the system name for a known system id", () => {
    render(<SystemInfoPanel selectedSystemId={KNOWN_SYSTEM_ID} />);
    expect(screen.getByText(KNOWN_SYSTEM_NAME)).toBeInTheDocument();
  });

  it("shows the system id", () => {
    render(<SystemInfoPanel selectedSystemId={KNOWN_SYSTEM_ID} />);
    expect(screen.getByText(String(KNOWN_SYSTEM_ID))).toBeInTheDocument();
  });

  it("shows a constellation name for the selected system", () => {
    render(<SystemInfoPanel selectedSystemId={KNOWN_SYSTEM_ID} />);
    // The panel must render some constellation label — not the fallback placeholder
    expect(screen.queryByText(/select a solar system/i)).not.toBeInTheDocument();
    // The component must contain at least one element with constellation text
    const panel = screen.getByTestId("system-info-panel");
    expect(panel).toHaveTextContent(/constellation/i);
  });

  it("shows a region name for the selected system", () => {
    render(<SystemInfoPanel selectedSystemId={KNOWN_SYSTEM_ID} />);
    const panel = screen.getByTestId("system-info-panel");
    expect(panel).toHaveTextContent(/region/i);
  });

  it("replaces content when selectedSystemId changes to null", () => {
    const { rerender } = render(
      <SystemInfoPanel selectedSystemId={KNOWN_SYSTEM_ID} />,
    );
    expect(screen.getByText(KNOWN_SYSTEM_NAME)).toBeInTheDocument();

    rerender(<SystemInfoPanel selectedSystemId={null} />);
    expect(screen.queryByText(KNOWN_SYSTEM_NAME)).not.toBeInTheDocument();
    expect(screen.getByText(/select a solar system/i)).toBeInTheDocument();
  });

  it("replaces content when selectedSystemId changes to a different system", () => {
    const { rerender } = render(
      <SystemInfoPanel selectedSystemId={KNOWN_SYSTEM_ID} />,
    );
    expect(screen.getByText(KNOWN_SYSTEM_NAME)).toBeInTheDocument();

    // System 30000002 "M 974"
    rerender(<SystemInfoPanel selectedSystemId={30000002} />);
    expect(screen.queryByText(KNOWN_SYSTEM_NAME)).not.toBeInTheDocument();
    expect(screen.getByText("M 974")).toBeInTheDocument();
  });

  describe("XYZ coordinates", () => {
    it("shows X coordinate in light-years for the selected system", () => {
      render(<SystemInfoPanel selectedSystemId={KNOWN_SYSTEM_ID} />);
      const entry = SOLAR_SYSTEMS.get(KNOWN_SYSTEM_ID)!;
      const panel = screen.getByTestId("system-info-panel");
      expect(panel).toHaveTextContent(`X: ${formatCoordLy(entry.x)}`);
    });

    it("shows Y coordinate in light-years for the selected system", () => {
      render(<SystemInfoPanel selectedSystemId={KNOWN_SYSTEM_ID} />);
      const entry = SOLAR_SYSTEMS.get(KNOWN_SYSTEM_ID)!;
      const panel = screen.getByTestId("system-info-panel");
      expect(panel).toHaveTextContent(`Y: ${formatCoordLy(entry.y)}`);
    });

    it("shows Z coordinate in light-years for the selected system", () => {
      render(<SystemInfoPanel selectedSystemId={KNOWN_SYSTEM_ID} />);
      const entry = SOLAR_SYSTEMS.get(KNOWN_SYSTEM_ID)!;
      const panel = screen.getByTestId("system-info-panel");
      expect(panel).toHaveTextContent(`Z: ${formatCoordLy(entry.z)}`);
    });

    it("does not show coordinate labels in the empty state", () => {
      render(<SystemInfoPanel selectedSystemId={null} />);
      const panel = screen.getByTestId("system-info-panel");
      expect(panel).not.toHaveTextContent(/\bX:/);
      expect(panel).not.toHaveTextContent(/\bY:/);
      expect(panel).not.toHaveTextContent(/\bZ:/);
    });
  });
});
