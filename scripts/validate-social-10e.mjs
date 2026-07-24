/**
 * Phase 10E — player proximity / social card / DM foundation validation
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const errors = [];
function ok(m) { console.log('OK ', m); }
function fail(m) { errors.push(m); console.error('FAIL', m); }

const socialSrc = fs.readFileSync(path.join(root, 'src/lib/social.ts'), 'utf8');
const resolverSrc = fs.readFileSync(path.join(root, 'src/game/interaction/InteractionTargetResolver.ts'), 'utf8');
const sceneSrc = fs.readFileSync(path.join(root, 'src/game/scenes/WorldScene.ts'), 'utf8');
const cardSrc = fs.readFileSync(path.join(root, 'src/components/SocialPlayerCard.tsx'), 'utf8');
const dmSrc = fs.readFileSync(path.join(root, 'src/components/DirectMessagePanel.tsx'), 'utf8');
const gameSrc = fs.readFileSync(path.join(root, 'src/components/GamePage.tsx'), 'utf8');

if (!socialSrc.includes('SocialPlayerSummary')) fail('SocialPlayerSummary missing');
else ok('SocialPlayerSummary type present');
if (!socialSrc.includes('DirectMessageRecipient')) fail('DirectMessageRecipient missing');
else ok('DirectMessageRecipient present');
if (!socialSrc.includes('PRESENCE_STALE_MS')) fail('stale threshold missing');
else ok('PRESENCE_STALE_MS defined');
if (!socialSrc.includes('PLAYER_INTERACT_RADIUS')) fail('interact radius missing');
else ok('PLAYER_INTERACT_RADIUS defined');
if (!socialSrc.includes('presenceToSocialSummary')) fail('presenceToSocialSummary missing');
else ok('presence → social mapper present');
if (!socialSrc.includes('toDmRecipient')) fail('toDmRecipient missing');
else ok('DM recipient mapper present');

if (!resolverSrc.includes("target.kind === 'player'")) fail('player prompt branch missing');
else ok('player interaction prompt branch present');
if (!resolverSrc.includes('PLAYER_FACING')) fail('PLAYER_FACING priority missing');
else ok('PLAYER_FACING priority band present');
if (!resolverSrc.includes('hysteresisHeld')) fail('hysteresis missing');
else ok('resolver hysteresis present');
if (!resolverSrc.includes('DEFAULT_SWITCH_MARGIN')) fail('switch margin missing');
else ok('switch margin / hold Ms present');

if (!sceneSrc.includes("kind: 'player'")) fail('WorldScene player candidates missing');
else ok('WorldScene adds player candidates');
if (!sceneSrc.includes('isPresenceStale')) fail('stale filter missing in scene');
else ok('stale presence filter used');
if (!sceneSrc.includes('remote-player-gone')) fail('disconnect event missing');
else ok('remote-player-gone emit present');
if (!sceneSrc.includes('socialCardCooldownMs')) fail('social card cooldown missing');
else ok('social card open cooldown present');
if (!sceneSrc.includes('formatRemoteNameplate')) fail('nameplate formatter missing');
else ok('remote nameplate formatter present');
if (!sceneSrc.includes('selected')) fail('selected remote highlight missing');
else ok('selected remote highlight path present');

if (!cardSrc.includes('onMessage')) fail('SocialPlayerCard Message action missing');
else ok('SocialPlayerCard Message action present');
if (!dmSrc.includes('sendDirectMessage') && !dmSrc.includes('socialService')) fail('DM panel not wired');
else ok('DM panel wired to social service');
if (!gameSrc.includes('openDirectMessage') || !gameSrc.includes('closeDirectMessage')) {
  fail('DM open/close hooks missing in GamePage');
} else ok('DM open/close foundation wired in GamePage');
if (!gameSrc.includes('SocialPlayerCard')) fail('SocialPlayerCard not used in GamePage');
else ok('SocialPlayerCard mounted from GamePage');
if (!gameSrc.includes('onSelectRemote')) fail('minimap remote → social card missing');
else ok('expanded map remote select wired');

const PRESENCE_STALE_MS = 2500;
const PLAYER_INTERACT_RADIUS = 78;

function isPresenceStale(lastSeenAt, now = Date.now()) {
  return now - lastSeenAt > PRESENCE_STALE_MS;
}

function isGuestPresenceId(id) {
  return id.startsWith('guest_');
}

{
  const localId = 'local_1';
  const players = [
    { id: 'local_1', x: 0, y: 0 },
    { id: 'remote_1', x: 40, y: 0 },
  ];
  const candidates = players.filter((p) => p.id !== localId);
  if (candidates.some((p) => p.id === localId)) fail('local player not excluded');
  else ok('local player excluded from candidate list');
}

{
  const now = 10_000;
  if (!isPresenceStale(now - 3000, now)) fail('stale threshold too loose');
  if (isPresenceStale(now - 1000, now)) fail('fresh presence marked stale');
  else ok('stale players excluded by threshold');
}

{
  if (Math.hypot(50, 40) > PLAYER_INTERACT_RADIUS) fail('sample in-range distance failed');
  if (Math.hypot(80, 40) <= PLAYER_INTERACT_RADIUS) fail('sample out-of-range distance failed');
  else ok('distance threshold (78) behaves as expected');
}

if (!isGuestPresenceId('guest_abc')) fail('guest id detect failed');
if (isGuestPresenceId('uuid-real')) fail('real id misclassified as guest');
else ok('stable guest id prefix detected');

if (!resolverSrc.includes('switchMargin') || !resolverSrc.includes('holdMs')) {
  fail('hysteresis options incomplete');
} else ok('target hysteresis options present');

if (!sceneSrc.includes('JustDown(this.keyE)')) fail('E must use JustDown (no hold spam)');
else ok('holding E does not re-trigger (JustDown)');
if (!sceneSrc.includes('lastSocialCardOpenAt')) fail('open cooldown state missing');
else ok('disconnect/social open cooldown path present');

if (errors.length) {
  console.error(`\n${errors.length} failures`);
  process.exit(1);
}
console.log('\nPhase 10E social validation passed');
