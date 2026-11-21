// Source-of-truth event type constants for the audit log.
// Mirror copies live at:
//   ~/parker-arcade-shell-split/electron/event-types.ts
//   ~/parker-parent-admin/lib/event-types.ts
//
// Keep all three in sync by hand. The event_type STRING is the wire
// format — what gets stored in event_log.event_type. Adding a new event
// is just adding a constant here + emitting it from a callsite.
//
// Naming: dotted lowercase namespaces. <area>.<noun>.<verb>
//   arcade.kiosk.toggle, lobby.game_tile.click, overlay.answer.submitted
//
// Severity convention (set per-emit, not per-type):
//   'info'  — normal happy-path event
//   'warn'  — degraded but not broken (kiosk re-engage from blur, hard-abort)
//   'error' — actually broken (render-process-gone, fetch failures)
//   'audit' — sensitive actions Mudaber would notice missing if absent
//             (chat persists, override applied, game launch)

(function (root) {
  'use strict';
  var ARCADE_EVENT_TYPES = Object.freeze({
    // ─── arcade-shell (Electron) ───
    ARCADE_BOOT:                 'arcade.boot',
    ARCADE_KIOSK_TOGGLE:         'arcade.kiosk.toggle',
    ARCADE_KIOSK_REENGAGE:       'arcade.kiosk.reengage',
    ARCADE_PANIC_EXIT:           'arcade.panic.exit',
    ARCADE_ADMIN_QUIT:           'arcade.admin.quit',
    ARCADE_GAME_LAUNCH:          'arcade.game.launch',
    ARCADE_GAME_READY:           'arcade.game.ready',
    ARCADE_GAME_EXIT:            'arcade.game.exit',
    ARCADE_GAME_HARD_ABORT:      'arcade.game.hard_abort',
    ARCADE_STUDY_BREAK_TRIGGER:  'arcade.study_break.trigger',
    ARCADE_STUDY_BREAK_FINISH:   'arcade.study_break.finish',
    ARCADE_OVERRIDE_DETECTED:    'arcade.override.detected',
    ARCADE_RENDER_PROCESS_GONE:  'arcade.render_process_gone',
    // ─── arcade-hub-lobby (browser) ───
    LOBBY_LOAD:                  'lobby.load',
    LOBBY_PROFILE_PICK:          'lobby.profile.pick',
    LOBBY_MODE_TOGGLE:           'lobby.mode.toggle',
    LOBBY_CATEGORY_FILTER:       'lobby.category.filter',
    LOBBY_GAME_TILE_CLICK:       'lobby.game_tile.click',
    LOBBY_SHOW_ALL_CLICK:        'lobby.show_all.click',
    LOBBY_SWITCH_PROFILE_CLICK:  'lobby.switch_profile.click',
    // ─── arcade-hub-overlay (browser) ───
    OVERLAY_LOAD:                'overlay.load',
    OVERLAY_QUESTION_SHOWN:      'overlay.question.shown',
    OVERLAY_ANSWER_SUBMITTED:    'overlay.answer.submitted',
    OVERLAY_BREAK_DONE:          'overlay.break.done',
    OVERLAY_FINISHED:            'overlay.finished',
    OVERLAY_MANUAL_GO:           'overlay.manual.go',
    BACK_BUTTON_CLICK:           'arcade.back_button.click',
    GATE_SHOWN:                  'gate.shown',
    // ─── parent-admin ───
    CHAT_MESSAGE_PERSISTED:      'chat.message.persisted',
    CHAT_SLASH_COMMAND:          'chat.slash.command',
    CHAT_TOOL_USE:               'chat.tool.use',
    CHAT_TOOL_RESULT:            'chat.tool.result',
    OVERRIDE_APPLIED:            'override.applied',
    OVERRIDE_CLEARED:            'override.cleared',
    PARENT_SIGNIN:               'parent.signin',
    // ─── generic ───
    ERROR_UNHANDLED:             'error.unhandled',
  });
  if (typeof window !== 'undefined') window.ARCADE_EVENT_TYPES = ARCADE_EVENT_TYPES;
  if (typeof module !== 'undefined' && module.exports) module.exports = ARCADE_EVENT_TYPES;
})(typeof globalThis !== 'undefined' ? globalThis : this);
