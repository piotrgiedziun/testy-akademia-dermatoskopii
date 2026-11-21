import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LensPresenterControls } from './LensPresenterControls';
import { IDLE_PRESENTER_STATUS, type PresenterStatus } from './lensBridge';

// t() returns the key, so assertions do not depend on the copy
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function setup(status: Partial<PresenterStatus> = {}, ready = true) {
  const onStart = vi.fn();
  const onAction = vi.fn();
  render(
    <LensPresenterControls
      status={{ ...IDLE_PRESENTER_STATUS, ...status }}
      ready={ready}
      onStart={onStart}
      onAction={onAction}
      projectorUrl="/lens/projector"
    />
  );
  return { onStart, onAction };
}

describe('LensPresenterControls', () => {
  it('offers to start a presentation when idle', () => {
    const { onStart } = setup();
    expect(screen.getByRole('status')).toHaveTextContent('lens.presenter.idle');
    fireEvent.click(screen.getByRole('button', { name: /lens.presenter.start/ }));
    expect(onStart).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /lens.presenter.notes/ })).toBeNull();
  });

  it('is disabled until the lens is ready', () => {
    setup({}, false);
    expect(screen.getByRole('button', { name: /lens.presenter.start/ })).toBeDisabled();
  });

  it('shows the toggles while presenting and reports their state', () => {
    const { onAction } = setup({ active: true, connected: true, notes: true });
    expect(screen.getByRole('status')).toHaveTextContent('lens.presenter.connected');
    const notes = screen.getByRole('button', { name: /lens.presenter.notes/ });
    expect(notes).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /lens.presenter.blank/ })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(notes);
    fireEvent.click(screen.getByRole('button', { name: /lens.presenter.blank/ }));
    fireEvent.click(screen.getByRole('button', { name: /lens.presenter.intro/ }));
    fireEvent.click(screen.getByRole('button', { name: /lens.presenter.end/ }));
    expect(onAction.mock.calls.map(([action]) => action)).toEqual(['notes', 'blank', 'intro', 'end']);
    // connected: no need to (re)open the projector window
    expect(screen.queryByRole('button', { name: /lens.presenter.openProjector$/ })).toBeNull();
  });

  it('when the projector never connected, offers to reopen it and a plain link', () => {
    const { onStart } = setup({ active: true, connected: false, waiting: false });
    expect(screen.getByRole('status')).toHaveTextContent('lens.presenter.disconnected');
    fireEvent.click(screen.getByRole('button', { name: /lens.presenter.openProjector$/ }));
    expect(onStart).toHaveBeenCalledOnce();
    const link = screen.getByRole('link', { name: 'lens.presenter.openProjectorPage' });
    expect(link).toHaveAttribute('href', '/lens/projector');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('while waiting, explains what to do and does not offer to reopen yet', () => {
    setup({ active: true, waiting: true });
    expect(screen.getByRole('status')).toHaveTextContent('lens.presenter.waiting');
    expect(screen.getByText('lens.presenter.help')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lens.presenter.openProjector$/ })).toBeNull();
  });

  it('explains the intro state, with the YouTube link when it cannot be embedded', () => {
    setup({ active: true, connected: true, intro: true, introState: 'fail', introUrl: 'https://www.youtube.com/watch?v=x' });
    expect(screen.getByRole('button', { name: /lens.presenter.introStop/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/lens.presenter.introFail/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'lens.presenter.introYouTube' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=x'
    );
  });
});
