# Duplicate Greeting Fix

## Problem
Users were seeing two welcome messages when the chat interface loaded:
- First greeting: "Hola, ¡bienvenido! ¿Qué producto te gustaría destacar hoy?..."
- Second greeting: "¡Hola de nuevo! Estoy listo para ayudarte..."

## Root Cause
React's `useEffect` hook can run multiple times, especially in development mode with React Strict Mode. The initial greeting was being fetched twice because the effect had no protection against duplicate calls.

## Solution
Added a **ref-based guard** (`hasGreetedRef`) to ensure the initial greeting is only fetched once per component instance:

```typescript
const hasGreetedRef = React.useRef(false);

React.useEffect(() => {
  // Prevent duplicate calls (React may run effects twice in dev mode)
  if (hasGreetedRef.current) return;
  hasGreetedRef.current = true;
  
  const fetchInitialGreeting = async () => {
    // ... fetch logic ...
  };

  fetchInitialGreeting();
}, []);
```

## Why This Works
- `useRef` maintains its value across re-renders
- The ref check happens **before** the async operation starts
- Once set to `true`, subsequent effect runs will early-return
- This pattern is React-recommended for preventing duplicate async calls

## Files Modified
- `/frontend/src/app/v2/_components/AgentChat.tsx`

## Testing
1. Navigate to the V2 page
2. Log in with Google
3. Click "Product Showcase"
4. Verify only ONE greeting message appears
5. Test that subsequent messages work normally

## Note for Production
This fix works in both development and production modes. In production, React doesn't remount components as aggressively, but this guard ensures consistency across all environments.

