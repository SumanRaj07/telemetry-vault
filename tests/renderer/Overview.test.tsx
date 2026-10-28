// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Overview from '../../src/renderer/pages/Overview';
import { HashRouter } from 'react-router-dom';

function mockTelemetry() {
  (window as unknown as Record<string, unknown>).telemetry = {
    activity: {
      getSummary: vi.fn().mockResolvedValue({
        totalActiveMs: 0, codingMs: 0, sessionCount: 0, appCount: 0,
        commits: 0, activeProjects: 0, focusMs: 0, focusCount: 0, idleMs: 0,
      }),
      getHeatmap: vi.fn().mockResolvedValue([]),
      getTimeline: vi.fn().mockResolvedValue([]),
    },
    goals: { progress: vi.fn().mockResolvedValue([]) },
  };
}

describe('Overview empty state', () => {
  it('shows an honest empty state instead of fabricated data', async () => {
    mockTelemetry();
    render(
      <HashRouter>
        <Overview />
      </HashRouter>,
    );
    expect(await screen.findByText('No activity recorded yet')).toBeInTheDocument();
    expect(screen.queryByText(/12h 30m/)).not.toBeInTheDocument();
  });
});
