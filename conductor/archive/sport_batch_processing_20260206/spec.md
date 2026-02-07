# Specification: Sport-Level Batch Processing

## 1. Overview
The goal is to introduce granular batch processing capabilities to the `Scout` page. Users can currently process the "Entire Slate" or individual games. This feature adds a middle ground: the ability to "Process [Sport]" (e.g., "Process NBA"). This allows users to target specific sports for full analysis (Scan + Veto + Queue) without committing to the entire multi-sport slate.

## 2. Functional Requirements

### 2.1 UI Enhancements
- **Sport Header Action:**
    - Add a "Process [Sport]" button (or icon with label) to the header section of each sport group in `Scout.tsx`.
    - **Location:** To the immediate right of the Sport Label / Icon container.
    - **State:**
        - **Default:** Visible if there are unprocessed games for that sport in the current view.
        - **Processing:** Show a spinner or "Processing..." state while the batch operation is active for that sport.
        - **Disabled/Hidden:** If all games for that sport in the current window are already processed/queued.

### 2.2 Batch Logic
- **Scope:**
    - The action must apply **only** to the specific sport (e.g., NBA).
    - The action must **respect the active Time Window filter** (e.g., if "Early" is selected, only process Early NBA games).
    - It must **exclude** games that are already in the Queue or have valid Scan Results (prevent double-processing).
- **Workflow:**
    - Trigger the existing `processBatch` logic but filtered to the target sport and active window.
    - **Steps:** Quick Scan -> Detailed Analysis (if passed) -> Add to Queue.

### 2.3 Feedback & Visibility
- **Real-Time Card Updates:**
    - As the batch processor iterates through games, the individual Game Cards in the Scout list must update visually in real-time.
    - If a game is added to the queue, its card state should reflect "In Queue".
    - If a game is scanned but rejected, its card should show the Scan Signal (Red/Yellow/White) and relevant description.
    - **Bug Fix:** Address the user's report that batch results aren't currently visible on cards by ensuring the `scanResults` and `queue` context states are updated and propagated to `ScoutGameCard` components immediately after each item is processed, not just at the end.

## 3. Non-Functional Requirements
- **Performance:** Batch processing should not freeze the UI. React state updates should be optimized to prevent excessive re-renders of the entire list.
- **Consistency:** The button styling should match existing "Process Entire Slate" or "Process Batch" buttons (e.g., using `ink-accent` colors).

## 4. Out of Scope
- Changes to the core Veto/Analysis logic itself.
- New filtering options beyond the existing Time Windows.
