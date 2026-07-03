import { useSyncExternalStore } from 'react';
import { notificationQueue, type ActiveNotification } from '../lib/notificationQueue';

/**
 * Subscribes to the global notification queue and renders the SINGLE
 * currently-visible notification (or nothing). All notification systems in
 * the game push into notificationQueue; this is the only thing that draws
 * them, guaranteeing one-at-a-time with no overlap.
 */
export function NotificationBanner() {
  const current = useSyncExternalStore<ActiveNotification | null>(
    cb => notificationQueue.subscribe(cb),
    () => notificationQueue.getCurrent(),
    () => notificationQueue.getCurrent(),
  );

  if (!current) return null;

  const highClass = current.priority === 'high' ? ' notif-banner--high' : '';

  return (
    <div className="notif-layer" aria-live="polite">
      <div
        key={current.id}
        className={`notif-banner notif-banner--${current.kind}${highClass}`}
        role="status"
      >
        {current.icon && (
          <span className="notif-banner__icon" aria-hidden>{current.icon}</span>
        )}
        <div className="notif-banner__body">
          {current.title && <span className="notif-banner__title">{current.title}</span>}
          <span className="notif-banner__text">{current.text}</span>
        </div>
        <button
          className="notif-banner__close"
          onClick={() => notificationQueue.dismissCurrent()}
          aria-label="Dismiss notification"
          title="Dismiss"
        >✕</button>
      </div>
    </div>
  );
}
