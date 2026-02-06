# Plan: Chat Mode Toggle Button

## Task Description
Add a mode toggle button to the left side of the message input field in the chat form. This button will allow users to cycle through different modes (Default, Plan, Bypass Permissions) with each click, similar to how the send button is positioned on the right side.

## Objective
Enable users to easily cycle through operational modes directly from the chat interface without using slash commands, providing a more intuitive and discoverable way to control Claude Code's behavior.

## Problem Statement
Currently, users must use slash commands or other mechanisms to switch Claude Code modes. This feature request aims to add a visual button that provides quick access to mode switching, making the interface more user-friendly and the mode options more discoverable.

## Solution Approach
Add a mode toggle button to the left of the chat input textarea that:
1. Cycles through modes on each click: Default → Plan → Bypass → Default
2. Displays a distinct icon and color for each mode
3. Shows a tooltip on hover indicating the current mode
4. Sends the appropriate mode prefix with messages when a non-default mode is active

## Relevant Files
Use these files to complete the task:

- **public/index.html** - Add the new mode toggle button element to the chat form
- **public/style.css** - Add styles for the mode button and its different states/modes
- **public/app.js** - Add JavaScript logic for mode cycling, state management, and message handling

### New Files
None required - all changes can be made to existing files.

## Implementation Phases

### Phase 1: Foundation
Add the HTML structure for the mode toggle button with all three mode icons.

### Phase 2: Core Implementation
Implement the JavaScript logic for mode cycling and state management, then style the button states.

### Phase 3: Integration & Polish
Integrate mode selection with message sending and add visual polish with the neon theme.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Add Mode State and Configuration to JavaScript
- Add `currentMode` property to the `state` object in app.js (default: `'default'`)
- Add `modeIndex` to track position in cycle (default: `0`)
- Define modes configuration array with name, icon, color, and prefix:
  ```javascript
  const MODES = [
    { name: 'default', label: 'Default', color: 'var(--accent)', prefix: '' },
    { name: 'plan', label: 'Plan Mode', color: 'var(--warning)', prefix: '/plan ' },
    { name: 'bypass', label: 'Bypass Permissions', color: 'var(--success)', prefix: '--dangerously-skip-permissions ' }
  ];
  ```

### 2. Add HTML Element for Mode Button
- Add a `<button type="button" id="mode-btn" title="Default">` before the `#chat-input` textarea in the chat form
- Include SVG icons for all three modes inside the button (hide/show based on state):
  - Default: Chat bubble icon (cyan)
  - Plan: Clipboard/document icon (orange/warning)
  - Bypass: Lightning bolt icon (green/success)
- Set initial state to show default icon

### 3. Style the Mode Button Base
- Match the `#send-btn` dimensions (50x50px) for visual consistency
- Use `type="button"` to prevent form submission
- Add base styles matching the send button appearance
- Position button to align with the textarea height
- Add `flex-shrink: 0` to prevent button compression

### 4. Style Mode Button States
- Create CSS classes for each mode: `.mode-default`, `.mode-plan`, `.mode-bypass`
- Each mode class sets:
  - Button border/glow color
  - Icon visibility (show only active mode's icon)
  - Background subtle tint
- Add hover states with enhanced glow effects for each mode
- Add smooth transition for color/glow changes between modes

### 5. Implement Mode Cycle Click Handler
- Get reference to mode button element
- On click, increment `state.modeIndex` and wrap around: `(state.modeIndex + 1) % MODES.length`
- Update `state.currentMode` to the new mode name
- Call `updateModeButton()` to refresh UI

### 6. Implement updateModeButton() Function
- Remove all mode classes from button
- Add the current mode's class
- Update button `title` attribute to show current mode label
- Hide all SVG icons, show only the current mode's icon

### 7. Integrate Mode with Message Sending
- Modify `sendMessage()` function to check `state.currentMode`
- If mode has a prefix and message doesn't already start with `/`, prepend the prefix
- Keep mode persistent after sending (user can click to change back to default)

### 8. Add Visual Feedback Enhancements
- Add pulsing glow animation when non-default mode is active
- Add CSS keyframes for subtle pulse effect on plan/bypass modes
- Ensure the button clearly stands out when a special mode is selected

### 9. Handle Edge Cases
- Ensure mode button is disabled when chat input is disabled (sync with `sendBtn.disabled`)
- Handle mode button state during streaming (disable during stream)
- Add mode button to the enable/disable logic in `finishStreaming()` and form submit

### 10. Validate Implementation
- Test clicking cycles through: Default → Plan → Bypass → Default
- Verify icon and color change with each click
- Confirm tooltip shows correct mode name
- Test that plan mode prepends `/plan ` to messages
- Test that bypass mode prepends appropriate prefix
- Check visual appearance matches the neon theme
- Test on mobile viewport for touch interactions

## Testing Strategy

### Manual Tests
- Mode cycles correctly: Default → Plan → Bypass → Default
- Each mode displays correct icon and color
- Tooltip updates with current mode name
- Message prefixes applied correctly for each mode

### Integration Tests
- End-to-end flow: cycle to Plan mode → type message → send → verify `/plan ` prefix
- Mode persists after sending message
- Mode button disabled state syncs with input disabled state

### Edge Cases
- Rapid clicking through modes
- Mode button interaction while streaming
- Mode button when input is disabled
- Touch interaction on mobile devices

## Acceptance Criteria
- [ ] Mode toggle button appears to the left of the chat input textarea
- [ ] Button uses consistent 50x50px sizing matching send button
- [ ] Clicking the button cycles through three modes: Default → Plan → Bypass → Default
- [ ] Each mode displays a distinct icon (chat bubble, clipboard, lightning bolt)
- [ ] Each mode has a distinct color (cyan, orange, green)
- [ ] Tooltip shows current mode name on hover
- [ ] Plan mode prepends `/plan ` to outgoing messages
- [ ] Bypass mode prepends `--dangerously-skip-permissions ` to outgoing messages
- [ ] Button follows the neon arcade theme styling with glow effects
- [ ] Button is disabled when chat input is disabled
- [ ] Works correctly on both desktop and mobile viewports

## Validation Commands
Execute these commands to validate the task is complete:

- Open browser developer tools and verify no console errors
- Manually test: Click mode button 3 times, verify it cycles Default → Plan → Bypass → Default
- Manually test: Set to Plan mode → type "hello" → send → verify message sent as `/plan hello`
- Hover over button in each mode, verify tooltip shows correct mode name
- Inspect element styles to verify neon theme consistency
- Test on mobile viewport (375px width) to verify responsive behavior

## Notes

### Mode Behavior Details
- **Default Mode**: No prefix, normal message sending, cyan color
- **Plan Mode**: Prepends `/plan ` to activate planning mode in Claude Code, orange/warning color
- **Bypass Permissions Mode**: Prepends `--dangerously-skip-permissions ` prefix, green/success color

### Design Considerations
- Single button with cycling behavior is simpler and more mobile-friendly than dropdown
- Each mode needs a visually distinct icon so users can quickly identify current state
- Pulsing glow on non-default modes draws attention to the active mode
- Tooltip provides additional context without cluttering the UI

### SVG Icons Reference
- Default (chat): `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`
- Plan (clipboard): `<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>`
- Bypass (lightning): `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`

### Future Enhancements
- Keyboard shortcut to cycle modes (e.g., Cmd/Ctrl+Shift+M)
- Long-press to reset to default mode
- Mode persistence preference in settings
