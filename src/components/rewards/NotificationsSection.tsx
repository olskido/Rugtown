/**
 * NotificationsSection.tsx — Phase 10H durable reward notifications.
 * Read-only display + mark-as-read. Clients cannot create reward notifications.
 */

import { useState } from 'react';
import { rewardService } from '../../game/rewards';
import type { PlayerNotificationView } from '../../game/rewards/settlement/SettlementTypes';

export interface NotificationsSectionProps {
  notifications: PlayerNotificationView[];
  unreadCount: number;
  onToast?: (text: string) => void;
}

export function NotificationsSection({ notifications, unreadCount, onToast }: NotificationsSectionProps) {
  const [busy, setBusy] = useState(false);

  const markAll = async () => {
    setBusy(true);
    await rewardService.markNotificationsRead();
    setBusy(false);
    onToast?.('Marked all as read');
  };

  const markOne = async (n: PlayerNotificationView) => {
    if (n.isRead) return;
    await rewardService.markNotificationsRead([n.id]);
  };

  return (
    <section className="reward-notifications">
      <h3 className="profile-section-title">
        Notifications
        {unreadCount > 0 && <span className="reward-unread-badge">{unreadCount}</span>}
      </h3>
      {notifications.length === 0 && <p className="profile-empty">No notifications.</p>}
      <ul className="reward-notification-list">
        {notifications.map((n) => (
          <li
            key={n.id}
            className={n.isRead ? 'reward-notification' : 'reward-notification reward-notification--unread'}
            onClick={() => markOne(n)}
          >
            <strong>{n.title}</strong>
            <span>{n.message}</span>
            <em>{new Date(n.createdAt).toLocaleString()}</em>
          </li>
        ))}
      </ul>
      {unreadCount > 0 && (
        <button type="button" className="profile-action-btn" disabled={busy} onClick={markAll}>
          Mark all as read
        </button>
      )}
    </section>
  );
}
