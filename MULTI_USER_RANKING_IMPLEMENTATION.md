# Multi-User Sessions + Reference Ranking Implementation Summary

## Overview
Successfully implemented two major features:
1. **Multi-user session isolation** - Each user gets their own isolated agent instance
2. **Reference image ranking system** - Tracks popularity of reference images based on successful usage

## Implementation Date
January 7, 2026

## Changes Made

### Feature 1: Multi-User Session Isolation

#### Frontend Changes
**File: `frontend/src/app/v2/_components/AgentChat.tsx`**
- Added `useAuth` hook import
- Extracted `user.uid` from authentication context
- Pass `userId` in FormData for all three agent-chat requests:
  - Initial greeting
  - Regular messages
  - Reset conversation

**File: `frontend/src/app/api/agent-chat/route.ts`**
- Forwards userId from frontend to backend (already in FormData)

#### Backend Changes
**File: `src/routes/agent-chat.ts`**
- Extracts `userId` from multipart form fields
- Creates fallback anonymous session ID if userId not provided: `anon-{timestamp}-{random}`
- Passes sessionId to `sendMessageToAgent()` function

**File: `src/services/productShowcaseAgent.ts`**
- Updated `messageQueue` interface to include `sessionId` field
- Modified `sendMessageToAgent` signature to accept `sessionId` parameter (default: 'default')
- Updated `processQueue` to include `session_id` in JSON request to Python agent

#### Python Agent Changes
**File: `Agents/Product Showcase/agent_direct.py`**
- Added session management with dictionary: `agents: dict[str, NanoBananaAgent]`
- Implemented `get_or_create_agent()` function for session-based agent instances
- Added `cleanup_old_sessions()` to remove inactive sessions (1 hour timeout)
- Added `periodic_cleanup()` background thread (runs every 5 minutes)
- Modified `main()` to extract `session_id` from requests and use session-specific agents
- Set MAX_AGENTS = 100 to prevent memory exhaustion

### Feature 2: Reference Image Ranking System

#### SQLite Schema Update
**File: `src/services/referenceLibrarySqlite.ts`**
- Added `ranking INTEGER DEFAULT 1` column to `reference_images` table
- Created index: `idx_reference_images_ranking` on `ranking DESC`
- Added migration to set existing records to `ranking = 1`
- Updated INSERT statements to include ranking column with default value 1
- Updated SELECT statements to include ranking in results

#### Ranking Function
**File: `src/services/referenceLibrarySqlite.ts`**
- Added `incrementReferenceRanking(referenceFilename: string)` function
- Uses `UPDATE reference_images SET ranking = ranking + 1 WHERE stored_path LIKE ?`
- Logs successful increments and warnings for missing references

#### Search Function Updates
**File: `src/services/referenceLibrarySqlite.ts`**
- Modified `searchReferenceImages()` to include ranking in all queries
- Updated sorting logic:
  - When no search terms: `ORDER BY ranking DESC, created_at DESC`
  - When scoring results: Sort by relevance first, then ranking as tiebreaker
- Added `ranking` field to `ReferenceImageSearchResult` type

#### New Endpoint
**File: `src/routes/increment-reference-ranking.ts`** (NEW)
- Created POST endpoint `/increment-reference-ranking`
- Accepts `{ referenceFilename: string }` in request body
- Calls `incrementReferenceRanking()` function
- Returns `{ status: 'success' }` or error

**File: `src/server.ts`**
- Imported and registered `incrementReferenceRankingRoute`

#### Ranking Trigger
**File: `Agents/Product Showcase/agent.py`**
- Added ranking increment after successful pipeline generation in `_handle_generate_pipeline()`
- Extracts reference filename using `os.path.basename(reference_image)`
- Makes POST request to `/increment-reference-ranking` endpoint
- Handles errors gracefully (logs but doesn't fail generation)

## How It Works

### Multi-User Session Flow
1. User logs in with Firebase authentication
2. Frontend extracts `user.uid` and includes in all agent requests
3. Backend extracts userId and passes as sessionId to Python agent
4. Python agent maintains separate `NanoBananaAgent` instance per sessionId
5. Each session has isolated state: history, selected reference, product image, text content
6. Inactive sessions cleaned up after 1 hour

### Ranking System Flow
1. User selects reference image and generates content
2. Pipeline completes successfully
3. Python agent calls `/increment-reference-ranking` with reference filename
4. Backend increments ranking in SQLite: `ranking = ranking + 1`
5. Future searches prioritize higher-ranked references in tiebreaker scenarios

## Testing Instructions

### Test Multi-User Isolation
1. Open two different browsers (or incognito windows)
2. Login with different Firebase accounts in each
3. User A: Upload product image (e.g., shoe), start conversation
4. User B: Upload different product (e.g., watch), start conversation
5. Verify User A only sees their shoe context
6. Verify User B only sees their watch context
7. Both should be able to complete workflow independently

### Test Ranking System
1. Check initial state: All references should have `ranking = 1`
2. Generate image with reference A → ranking should go from 1 to 2
3. Generate image with reference A again → ranking should go from 2 to 3
4. Generate image with reference B → ranking should go from 1 to 2
5. Search for references and verify higher-ranked ones appear first in ties

## Performance Characteristics

- **Memory**: ~50-100MB per agent instance, max 100 instances = ~10GB worst case
- **Cleanup**: Automatic every 5 minutes, 1-hour session timeout
- **SQLite**: Ranking column indexed for fast sorting
- **Network**: One additional HTTP call per successful generation (negligible overhead)

## Backward Compatibility

Both features maintain backward compatibility:
- **Sessions**: Missing userId defaults to anonymous session ID
- **Ranking**: Column has DEFAULT 1, existing queries work unchanged
- **Rollback**: Can revert to single-agent behavior by removing session_id parameter

## Files Modified

### Multi-User Sessions (5 files)
1. `frontend/src/app/v2/_components/AgentChat.tsx`
2. `frontend/src/app/api/agent-chat/route.ts`
3. `src/routes/agent-chat.ts`
4. `src/services/productShowcaseAgent.ts`
5. `Agents/Product Showcase/agent_direct.py`

### Ranking System (6 files)
1. `src/services/referenceLibrarySqlite.ts` - Schema + functions
2. `src/routes/increment-reference-ranking.ts` - NEW endpoint
3. `src/server.ts` - Register new route
4. `Agents/Product Showcase/agent.py` - Call ranking endpoint

## Next Steps

1. **Monitor in Production**:
   - Watch Python process memory usage
   - Verify session cleanup is working
   - Monitor ranking increments in logs

2. **Optional Enhancements**:
   - Add ranking decay over time (popular last month vs. all-time)
   - Add analytics dashboard for reference performance
   - Implement session persistence across backend restarts
   - Add user feedback mechanism (explicit thumbs up/down)

## Notes

- Session cleanup runs every 5 minutes in background thread
- Sessions timeout after 1 hour of inactivity
- Maximum 100 concurrent agent instances enforced
- Ranking increments are fire-and-forget (don't block generation)
- All changes are backward compatible with existing functionality

