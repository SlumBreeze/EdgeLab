# EdgeLab - AI Assistant Guide

## Project Overview

EdgeLab is a sophisticated sports betting analysis platform that combines **Mathematical Edge Finding** with **AI-Powered Qualitative Research**. It identifies value plays by comparing "Sharp" bookmaker lines (Pinnacle) against recreational market odds and validates them with Gemini AI agents that check for injuries, motivation traps, and narrative contradictions.

## Tech Stack

- **Frontend**: React 19, Vite, TypeScript
- **Styling**: Tailwind CSS (utility-first approach)
- **AI**: Google Gemini (Pro, Flash 3, and Flash 2.5 models)
- **Data Sources**: The Odds API, ESPN API
- **Database**: Supabase (optional persistence)
- **Deployment**: Google Cloud Run with Docker + nginx

## Project Structure

```
EdgeLab/
├── components/          # Reusable React components
│   ├── CompactSoftLines.tsx
│   ├── PullToRefresh.tsx
│   ├── QueuedGameCard.tsx
│   ├── StickyCardSummary.tsx
│   ├── SwipeableCard.tsx
│   └── Toast.tsx
├── pages/              # Main page views
│   └── Queue.tsx       # Deep analysis workflow
├── services/           # External API integrations
│   ├── espnService.ts
│   ├── geminiService.ts
│   └── oddsService.ts
├── hooks/              # Custom React hooks
├── utils/              # Helper functions
│   └── cardAnalytics.ts
├── docs/               # Documentation
│   ├── FEATURES.md     # Detailed feature descriptions
│   └── SETUP.md        # Setup instructions
├── App.tsx             # Main application component
├── types.ts            # TypeScript type definitions
├── constants.ts        # App-wide constants
├── Dockerfile          # Container configuration
└── cloudbuild.yaml     # GCP build config
```

## Core Concepts

### 1. Sharp vs Soft Lines
- **Sharp**: Pinnacle odds (considered market truth, lowest margins)
- **Soft**: Recreational books (DraftKings, FanDuel, etc.)
- **Edge**: When soft books offer better prices than sharp no-vig probability

### 2. AI Models Usage
- **Gemini 3 Pro**: Deep holistic analysis (matching math edge with game context)
- **Gemini 3 Flash**: Quick scans for injuries and roster news
- **Gemini 2.5 Flash**: OCR for screenshot-to-odds extraction

### 3. Workflows
- **Scout**: Daily feed showing line movements and quick injury checks
- **Queue**: Deep analysis with EV calculations and AI veto system
- **Card**: Active bet tracking
- **Bankroll**: Balance management with Supabase sync

### 4. AI Veto System
Multi-step validation before recommending plays:
1. **Price Veto**: Checks if odds are too expensive (e.g., > -160)
2. **Motivation Veto**: Flags narratives relying on "must win" stories
3. **Data Quality Veto**: Ensures verified injury information exists
4. **Contradiction Check**: Validates AI reasoning aligns with recommendation

## Development Guidelines

### Code Style
- **TypeScript**: Strict typing, use interfaces in `types.ts`
- **Components**: Functional components with hooks
- **Naming**: PascalCase for components, camelCase for functions/variables
- **Imports**: Group by external → internal → relative

### State Management
- React hooks (useState, useEffect, useContext)
- Local storage for persistence when Supabase unavailable
- No Redux or external state libraries

### API Integration
- All external calls in `/services` directory
- Error handling with try-catch and user-friendly messages
- Environment variables for API keys (see `.env.example`)

### Environment Variables
Required keys (defined in `.env`):
```bash
VITE_GEMINI_API_KEY=         # Google Gemini API
VITE_ODDS_API_KEY=           # The Odds API
VITE_SUPABASE_URL=           # Supabase project URL
VITE_SUPABASE_ANON_KEY=      # Supabase anon key
```

### Sport-Specific Logic
The app supports multiple sports with different edge thresholds:
- **NBA/CFB**: Higher thresholds (more variance)
- **NFL/NHL**: Lower thresholds (tighter markets)
- Check `constants.ts` for sport-specific configuration

### Timezone Handling
- Games refresh based on local timezone
- NFL/CFB refresh at 2 AM local time
- NBA/NHL refresh at 5 AM local time
- See refresh logic in relevant components

## Common Tasks

### Adding a New Sport
1. Add sport to supported list in `constants.ts`
2. Configure edge thresholds in `constants.ts`
3. Update `oddsService.ts` to fetch odds for new sport
4. Test quick scan and deep analysis workflows

### Modifying AI Prompts
- Quick scan prompts: `geminiService.ts` (search for "Quick Scan")
- Deep analysis prompts: `geminiService.ts` (search for "Holistic Analysis")
- Screenshot OCR: `geminiService.ts` (search for "extract odds")

### Updating Edge Calculation Logic
- Main math logic in `Queue.tsx`
- No-vig probability calculations use industry-standard formulas
- EV = (Probability × Payout) - (1 - Probability)

### Debugging Tips
- Check browser console for API errors
- Verify `.env` variables are loaded (prefixed with `VITE_`)
- Test API keys independently before debugging app logic
- Use React DevTools to inspect component state

## Deployment

### Local Development
```bash
npm install
npm run dev
# Access at http://localhost:5173
```

### Production Build
```bash
npm run build
npm run preview  # Test production build locally
```

### Google Cloud Run
```bash
# Build with Cloud Build
gcloud builds submit --config cloudbuild.yaml \
  --project YOUR_PROJECT_ID \
  --substitutions="_GEMINI_API_KEY=key,_ODDS_API_KEY=key,_SUPABASE_URL=url,_SUPABASE_KEY=key"

# Deploy to Cloud Run
gcloud run deploy edgelab \
  --image gcr.io/YOUR_PROJECT_ID/edgelab \
  --project YOUR_PROJECT_ID \
  --region us-central1 \
  --allow-unauthenticated
```

## Key Files to Understand

### `App.tsx`
Main application component with routing and global state. Handles tab navigation (Scout/Queue/Card) and bankroll management.

### `types.ts`
Central type definitions. Key types:
- `Game`: Represents a sporting event with odds
- `BookOdds`: Individual bookmaker odds
- `AnalysisResult`: AI analysis output
- `BankrollData`: User bankroll state

### `constants.ts`
Configuration constants:
- Supported sports and their codes
- Sport-specific edge thresholds
- UI constants (colors, thresholds)
- Bookmaker configurations

### `services/geminiService.ts`
All Gemini AI interactions:
- Quick scans (injury checks)
- Deep analysis (holistic evaluation)
- Screenshot OCR (odds extraction)
- Veto system logic

### `services/oddsService.ts`
The Odds API integration:
- Fetches live odds for all supported sports
- Filters for sharp (Pinnacle) and soft books
- Handles rate limiting and caching

### `pages/Queue.tsx`
Deep analysis workflow:
- Displays queued games
- Calculates EV and edge percentages
- Runs AI veto checks
- Generates play recommendations

## Testing Considerations

### Manual Testing Checklist
- [ ] Quick scan returns injury signals correctly
- [ ] EV calculations match expected values
- [ ] Screenshot OCR extracts odds accurately
- [ ] Veto system flags problematic plays
- [ ] Bankroll sync works with Supabase
- [ ] Line movement displays correctly
- [ ] Mobile swipe gestures work smoothly

### Edge Cases
- Handle missing odds from Pinnacle
- Gracefully degrade when APIs are unavailable
- Prevent division by zero in probability calculations
- Handle timezone edge cases at midnight
- Manage rate limits from external APIs

## Important Notes

### Security
- Never commit `.env` file to version control
- API keys are exposed in browser (frontend-only app)
- Use Supabase RLS for database security
- Validate all AI outputs before displaying

### Performance
- Minimize API calls (use caching where appropriate)
- Lazy load components when possible
- Optimize re-renders with React.memo when needed
- Keep bundle size small (currently ~500KB)

### AI Reliability
- AI analysis is suggestive, not guaranteed
- Always validate AI outputs with displayed data
- Cross-reference AI injury checks with official sources
- Treat contradiction flags as warnings, not blockers

## Future Enhancement Ideas
- Historical tracking and performance analytics
- Multiple AI model comparison
- Real-time line alerts and notifications
- Advanced Kelly criterion bet sizing
- Multi-leg parlay analysis
- Live in-game analysis

## Getting Help

1. Check existing documentation in `/docs`
2. Review type definitions in `types.ts`
3. Examine similar existing implementations
4. Test with The Odds API sandbox if available
5. Verify Gemini prompts return expected formats

---

**Last Updated**: January 2026
**Version**: Based on latest main branch (commit d978915)
