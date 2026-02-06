# VERSION CONTROL - Postty Agent System

> **Last Updated:** 2026-01-31
> **Status:** All components STABLE

---

## Quick Reference

| Component | Version | File | Backup |
|-----------|---------|------|--------|
| Agent Main | v6 | `agent.py` | `agent.backup-v6.py` |
| Get Post Types (Backend) | v2 | `get-post-types.ts` | `get-post-types.backup-v1.ts` |
| Get Post Types (Agent) | v2 | `agent.py` | - |
| Search References | v4 | `agent.py` | `agent.backup-v7.py` |
| NanoBanana Prompt | v4 | `agent.py` | - |
| NanoBanana Edit Prompt | v2 | `agent.py` | - |
| Pipeline Route | v2 | `pipeline.ts` | `pipeline.backup-v1.ts` |
| Edit Pipeline Handler | v2 | `agent.py` | - |
| Edit Feedback Handler | v2 | `agent.py` | - |
| Interpret User Changes | v1 | `agent.py` | - |
| Summarize User Changes | v2 | `agent.py` | - |
| Frontend Loading | v1 | `v3/page.tsx` | - |

---

## Detailed Version History

### Agent.py (Main Agent File)

**Current Version:** v6  
**Backups Available:**
- `agent.backup-v2.py`
- `agent.backup-v3.py`
- `agent.backup-v4.py`
- `agent.backup-v5.py`
- `agent.backup-v6.py` ← Latest stable before current

#### Functions with Version Control:

##### `_build_nanobanana_prompt()` - VERSION 4 (STABLE)
- **Purpose:** Build the initial prompt for NanoBanana image generation
- **Features:**
  - V1: Basic template structure
  - V2: Uses `_interpret_user_changes()` to process design_changes with LLM
  - V3: Added CRITICAL PRODUCT REPLACEMENT section
  - V4: Added AUTOMATIC COLOR ADAPTATION section (adapts background colors to product palette)

##### `_build_nanobanana_edit_prompt()` - VERSION 2 (STABLE)
- **Purpose:** Build the edit prompt for NanoBanana when user requests changes
- **Features:**
  - V1: Basic edit template
  - V2: Includes original reference design_guidelines for context

##### `_handle_get_post_types()` - VERSION 2 (STABLE)
- **Purpose:** Fetch post types from database filtered by product category
- **Features:**
  - V1: Basic post type fetching
  - V2: Filters by `product_category` first, then fallback to industry

##### `_handle_search_references_by_type()` - VERSION 4 (STABLE)
- **Purpose:** Search reference images by post type
- **Features:**
  - V1: Basic reference search
  - V2: Filter by product_category
  - V3: Hardcoded selected post type's example image as first reference
  - V4: Copies full design_guidelines/text_analysis from search results to hardcoded reference

##### `_handle_edit_pipeline()` - VERSION 2 (STABLE)
- **Purpose:** Handle edit requests using previously generated image
- **Features:**
  - V1: Basic edit pipeline
  - V2: Uses `last_generated_image` as reference instead of original

##### `_handle_edit_feedback()` - VERSION 2 (STABLE)
- **Purpose:** Process user feedback after image generation
- **Features:**
  - V1: Basic feedback handling
  - V2: Uses LLM to interpret feedback naturally

##### `_interpret_user_changes()` - VERSION 1 (STABLE)
- **Purpose:** Use Gemini Flash to interpret user's design change requests
- **Features:**
  - V1: Reformulates user input into clear NanoBanana instructions

##### `_summarize_user_changes()` - VERSION 2 (STABLE)
- **Purpose:** Summarize user's changes for confirmation message
- **Features:**
  - V1: Basic summarization with Gemini
  - V2: Cleans "THOUGHTS:" and similar prefixes from LLM response

---

### Backend Routes

##### `get-post-types.ts` - VERSION 2 (STABLE)
- **Location:** `src/routes/get-post-types.ts`
- **Backup:** `src/routes/get-post-types.backup-v1.ts`
- **Features:**
  - V1: Basic post type fetching by industry
  - V2: Filters by `product_category` first

##### `pipeline.ts` - VERSION 2 (STABLE)
- **Location:** `src/routes/pipeline.ts`
- **Backup:** `src/routes/pipeline.backup-v1.ts`
- **Features:**
  - V1: Basic pipeline with URL references
  - V2: Supports absolute paths for referenceImage (edit mode)

---

### Frontend

##### `v3/page.tsx` - Loading Messages
- **Location:** `frontend/src/app/v3/page.tsx`
- **Features:**
  - Contextual loading messages based on flow step
  - If `selectedReference` exists: "Analizando cambios", "Procesando ajustes"
  - If initial step: "Analizando producto", "Analizando luz y ángulo"

---

## Rollback Instructions

### To rollback agent.py:
```bash
cp "Agents/Product Showcase/agent.backup-vX.py" "Agents/Product Showcase/agent.py"
# Then restart backend
```

### To rollback get-post-types.ts:
```bash
cp "src/routes/get-post-types.backup-v1.ts" "src/routes/get-post-types.ts"
# Then restart backend
```

### To rollback pipeline.ts:
```bash
cp "src/routes/pipeline.backup-v1.ts" "src/routes/pipeline.ts"
# Then restart backend
```

---

## Flow Summary

```
1. User uploads product image
   ↓
2. Agent analyzes with Gemini Vision → product_name, category, industry
   ↓
3. _handle_get_post_types (V2) → fetches post types filtered by category
   ↓
4. User selects post type
   ↓
5. _handle_search_references_by_type (V3) → references with post type image first
   ↓
6. User selects reference
   ↓
7. User provides design changes (or "mantener igual")
   ↓
8. _interpret_user_changes (V1) → reformulates to clear instructions
   ↓
9. _summarize_user_changes (V2) → natural confirmation message
   ↓
10. _build_nanobanana_prompt (V4) → includes PRODUCT REPLACEMENT + COLOR ADAPTATION
   ↓
11. Pipeline generates image
   ↓
12. User requests edit (optional)
   ↓
13. _handle_edit_feedback (V2) → interprets feedback
   ↓
14. _build_nanobanana_edit_prompt (V2) → includes original reference style
   ↓
15. _handle_edit_pipeline (V2) → uses last_generated_image as reference
```

---

## Notes

- All functions marked with `DO NOT EDIT without explicit permission from the user`
- Always create a backup before making changes
- Test thoroughly after any modification
- Frontend loading messages are contextual via `useMemo`
