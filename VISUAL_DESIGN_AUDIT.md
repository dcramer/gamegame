# GameGame Visual Design Audit Report
## Workers (Cloudflare) vs Next.js Implementation

---

## 1. EXECUTIVE SUMMARY

**Overall Assessment**: ⚠️ **SIGNIFICANT DIFFERENCES FOUND**

The Next.js implementation has **critical visual differences** from the Workers implementation that will cause noticeable user experience discrepancies:

### Severity Breakdown:
- **CRITICAL Issues**: 2 (Font family, Dark mode forced)
- **HIGH Priority Issues**: 4 (Color value mismatches, Card border radius, CardContent padding)
- **MEDIUM Priority Issues**: 2 (Table cell padding, Missing components)
- **LOW Priority Issues**: 1 (Minor admin link difference)

**Key Finding**: The Next.js implementation is using a **completely different font** (Inter instead of Comfortaa) and the color palette has some conversion errors from HSL to OKLCH that affect visual appearance.

---

## 2. CRITICAL ISSUES (BREAKS VISUAL PARITY)

### 2.1 Font Family Mismatch ❌ CRITICAL
**Location**: Root layout and global styles

**Workers Implementation**:
- Uses **Comfortaa** font family
- Loaded from Google Fonts in `root.tsx` (line 76)
- Applied globally via CSS: `font-family: 'Comfortaa', sans-serif;` (globals.css line 82)

**Next.js Implementation**:
- Uses **Inter** font family
- Loaded via Next.js font optimization (layout.tsx line 2)
- Completely different typeface

**Impact**: This is the MOST SIGNIFICANT visual difference. Comfortaa is a rounded, friendly display font while Inter is a more traditional UI font. This changes the entire visual character of the application.

**Fix Required**:
```tsx
// In app/layout.tsx - REPLACE Inter with Comfortaa
import { Comfortaa } from "next/font/google";

const comfortaa = Comfortaa({ 
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"]
});

// Then use comfortaa.className instead of inter.className
<body className={comfortaa.className}>{children}</body>
```

### 2.2 Dark Mode Configuration ⚠️ CRITICAL
**Location**: Root HTML element

**Workers Implementation**:
- Dark mode is the DEFAULT (colors defined in :root)
- No explicit className="dark" on html element
- Colors are dark by default

**Next.js Implementation**:
- Has `className="dark"` explicitly set on html tag (layout.tsx line 18)
- Defaults to LIGHT mode colors, then switches to dark

**Impact**: While both end up in dark mode, the approach differs. Next.js explicitly forces dark mode.

**Recommendation**: Keep the current approach but ensure it matches Workers' visual appearance.

---

## 3. HIGH PRIORITY ISSUES (NOTICEABLE VISUAL DIFFERENCES)

### 3.1 Color Palette Conversion Issues ⚠️
**Issue**: HSL to OKLCH conversion has some discrepancies

**Comparison Table - Dark Mode**:

| Element | Workers (HSL) | Next.js (OKLCH) | Match? |
|---------|--------------|-----------------|--------|
| background | `hsl(0 0% 0%)` | `oklch(3.9% 0 0)` | ❌ Not exact |
| foreground | `hsl(0 0% 98%)` | `oklch(98% 0 0)` | ✅ Match |
| card | `hsl(0 0% 8%)` | `oklch(3.9% 0 0)` | ❌ Different |
| secondary | `hsl(0 0% 15%)` | `oklch(14.9% 0 0)` | ✅ Close |
| muted | `hsl(0 0% 12%)` | `oklch(14.9% 0 0)` | ❌ Different |
| muted-foreground | `hsl(0 0% 60%)` | `oklch(63.9% 0 0)` | ⚠️ Slightly different |
| accent | `hsl(0 0% 25%)` | `oklch(14.9% 0 0)` | ❌ Very different |
| border | `hsl(0 0% 18%)` | `oklch(14.9% 0 0)` | ❌ Different |
| input | `hsl(0 0% 18%)` | `oklch(14.9% 0 0)` | ❌ Different |
| ring | `hsl(0 0% 50%)` | `oklch(83.1% 0 0)` | ❌ Very different |

**Impact**: 
- **Background**: Next.js is slightly lighter (3.9% vs 0%)
- **Card**: Next.js cards are darker (3.9% vs 8%)
- **Muted**: Next.js muted areas are lighter (14.9% vs 12%)
- **Accent**: Next.js accent is much darker (14.9% vs 25%)
- **Border/Input**: Next.js borders are lighter (14.9% vs 18%)
- **Ring**: Next.js focus rings are much lighter (83.1% vs 50%)

**Fix Required**: Update globals.css to match exact Workers colors:
```css
.dark {
  --color-background: oklch(0% 0 0);     /* was 3.9% */
  --color-card: oklch(8% 0 0);           /* was 3.9% */
  --color-muted: oklch(12% 0 0);         /* was 14.9% */
  --color-accent: oklch(25% 0 0);        /* was 14.9% */
  --color-border: oklch(18% 0 0);        /* was 14.9% */
  --color-input: oklch(18% 0 0);         /* was 14.9% */
  --color-ring: oklch(50% 0 0);          /* was 83.1% */
}
```

### 3.2 Card Border Radius Mismatch 🔸
**Location**: Card component

**Workers**:
- `rounded-lg` (line 12 of card.tsx)

**Next.js**:
- `rounded-xl` (line 12 of card.tsx)

**Impact**: Next.js cards have MORE rounded corners than Workers

**Fix**: Change `rounded-xl` to `rounded-lg` in nextjs/components/ui/card.tsx line 12

### 3.3 CardContent Padding Difference 🔸
**Location**: CardContent component

**Workers**:
- Has padding: `p-6 pt-0` (card.tsx line 60)

**Next.js**:
- NO default padding: just `className` (card.tsx line 60)

**Impact**: Next.js cards may have inconsistent padding

**Fix**: Add default padding back to CardContent:
```tsx
// line 60 in nextjs/components/ui/card.tsx
<div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
```

### 3.4 Button Border Radius Inconsistency 🔸
**Location**: Button component

**Workers**:
- Uses simple `rounded` for all sizes (button.tsx lines 30-32)

**Next.js**:
- Uses `rounded` via buttonVariants (button.tsx line 8)
- Both are equivalent but implemented differently

**Impact**: Minimal - both use same border radius

**Status**: ✅ No action needed

---

## 4. MEDIUM PRIORITY ISSUES

### 4.1 Table Cell Padding Differences ⚠️
**Location**: Table components

**Workers**:
- TableHead: `h-12 px-4` (table.tsx line 59)
- TableCell: `p-4` (table.tsx line 73)

**Next.js**:
- TableHead: `h-10 px-2` (table.tsx line 76)
- TableCell: `p-2` (table.tsx line 91)

**Impact**: Next.js tables are more COMPACT with less padding

**Fix**: Update table.tsx to match Workers padding:
```tsx
// TableHead line 76
className={cn(
  'h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0',
  className
)}

// TableCell line 91
className={cn('p-4 align-middle [&:has([role=checkbox])]:pr-0', className)}
```

### 4.2 Missing UI Components 📦
**Workers has, Next.js missing**:
- `action-button.tsx`
- `badge.tsx`
- `save-button.tsx`
- `tabs.tsx`
- `toast.tsx`

**Next.js has, Workers missing**:
- `textarea.tsx`

**Impact**: Potentially missing functionality in Next.js

**Status**: ℹ️ Check if these components are needed for migrated features

---

## 5. LOW PRIORITY ISSUES (COSMETIC)

### 5.1 Footer Admin Link Difference
**Location**: Footer component

**Workers**: Shows Admin link if user is admin
**Next.js**: No admin link in footer

**Impact**: Minor UX difference

**Status**: ℹ️ Likely intentional change

---

## 6. COMPONENTS WITH PERFECT PARITY ✅

The following components match exactly between implementations:
- ✅ **Input** - Identical styling
- ✅ **Header** - Identical (except Link import)
- ✅ **Layout** - Identical structure
- ✅ **Heading** - Identical
- ✅ **Tooltip** - Identical
- ✅ **Chat** (structure) - Same component structure
- ✅ **Games page** - Near identical layout

---

## 7. CONFIGURATION DIFFERENCES

### 7.1 Tailwind Config
**Workers**: Tailwind v3 config style (tailwind.config.ts)
**Next.js**: Tailwind v4 @theme directive (globals.css)

**Key Differences**:
- Container config: Workers has explicit config, Next.js uses @theme
- Border radius variables: Both define the same values
- Animations: Both have accordion animations

**Status**: ✅ Functionally equivalent

### 7.2 Typography Plugin
**Workers**: Uses `@tailwindcss/typography` with extensive customization
**Next.js**: Typography config not visible in globals.css

**Impact**: Markdown rendering may differ

**Action Required**: Verify typography plugin is configured in Next.js

---

## 8. RESPONSIVE DESIGN COMPARISON

Both implementations use identical responsive breakpoints:
- Mobile: Default
- SM: `sm:` prefix
- MD: `md:` prefix  
- LG: `lg:` prefix
- XL: `xl:` prefix (via container config)

**Status**: ✅ Responsive behavior should match

---

## 9. PRIORITY FIXES CHECKLIST

### CRITICAL (Do First)
- [ ] Replace Inter font with Comfortaa in app/layout.tsx
- [ ] Verify Comfortaa is loaded with correct weights (300, 400, 500, 600, 700)

### HIGH (Do Soon)
- [ ] Fix dark mode color values in globals.css (background, card, muted, accent, border, input, ring)
- [ ] Change Card border-radius from rounded-xl to rounded-lg
- [ ] Add default padding to CardContent (p-6 pt-0)

### MEDIUM (Before Launch)
- [ ] Update Table component padding (h-12 px-4 for head, p-4 for cells)
- [ ] Verify missing UI components are not needed
- [ ] Check if typography plugin is configured

### LOW (Nice to Have)
- [ ] Consider adding admin link to footer if needed

---

## 10. TESTING RECOMMENDATIONS

After applying fixes, test these critical flows:

1. **Font Rendering**: Compare text appearance across all pages
2. **Card Appearance**: Check game cards on /games page
3. **Table Layout**: Check admin tables for proper spacing
4. **Form Elements**: Verify input fields and buttons match
5. **Focus States**: Test keyboard navigation (ring color)
6. **Dark Mode**: Ensure colors match across all components
7. **Responsive**: Test mobile vs desktop layouts

---

## 11. ESTIMATED EFFORT

- **Critical Fixes**: ~30 minutes
- **High Priority Fixes**: ~1 hour
- **Medium Priority Fixes**: ~30 minutes
- **Testing**: ~1-2 hours

**Total Estimated Time**: 3-4 hours

---

## 12. FILES REQUIRING CHANGES

1. `/Users/dcramer/src/gamegame/nextjs/app/layout.tsx` - Font import
2. `/Users/dcramer/src/gamegame/nextjs/app/globals.css` - Color values
3. `/Users/dcramer/src/gamegame/nextjs/components/ui/card.tsx` - Border radius and padding
4. `/Users/dcramer/src/gamegame/nextjs/components/ui/table.tsx` - Cell padding

---

## CONCLUSION

The Next.js implementation is **structurally very similar** to the Workers implementation but has **significant styling differences** that will be immediately noticeable to users:

**Most Critical Issues**:
1. Wrong font family (Inter vs Comfortaa) - VERY NOTICEABLE
2. Color conversion errors causing incorrect shades - NOTICEABLE
3. Card styling differences - SOMEWHAT NOTICEABLE

These issues should be addressed before considering the migration complete. The fixes are straightforward and can be applied quickly.
# Detailed Code Comparison: Workers vs Next.js

## 1. FONT CONFIGURATION

### Workers - root.tsx (lines 63-78)
```tsx
export const links: LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "icon", href: "/favicon-32x32.svg", type: "image/svg+xml", sizes: "32x32" },
  { rel: "icon", href: "/favicon-16x16.svg", type: "image/svg+xml", sizes: "16x16" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.svg", sizes: "180x180" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Comfortaa:wght@300;400;500;600;700&display=swap",
  },
];
```

### Workers - globals.css (line 82)
```css
body {
  @apply bg-background text-foreground;
  font-family: 'Comfortaa', sans-serif;
}
```

### Next.js - layout.tsx (lines 1-5)
```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";  // ❌ WRONG FONT
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
```

### Next.js - layout.tsx (line 19)
```tsx
<body className={inter.className}>{children}</body>  // ❌ USING INTER
```

---

## 2. COLOR PALETTE

### Workers - globals.css (lines 18-43 and 45-70)
```css
@layer base {
  :root {
    --background: 0 0% 0%;              /* Pure black */
    --foreground: 0 0% 98%;             /* Near white */
    --card: 0 0% 8%;                    /* Very dark gray */
    --card-foreground: 0 0% 98%;
    --popover: 0 0% 8%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;                /* White text */
    --primary-foreground: 0 0% 0%;      /* Black bg */
    --secondary: 0 0% 15%;              /* Dark gray */
    --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 12%;                  /* Very dark gray */
    --muted-foreground: 0 0% 60%;       /* Medium gray */
    --accent: 0 0% 25%;                 /* Medium-dark gray */
    --accent-foreground: 0 0% 98%;
    --destructive: 0 72% 50%;           /* Red */
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 18%;                 /* Dark gray border */
    --input: 0 0% 18%;                  /* Dark gray input */
    --ring: 0 0% 50%;                   /* Medium gray focus ring */
    --chart-1: 0 0% 70%;
    --chart-2: 0 0% 60%;
    --chart-3: 0 0% 50%;
    --chart-4: 0 0% 40%;
    --chart-5: 0 0% 30%;
  }

  .dark {
    /* Same as :root - dark mode is default */
  }
}
```

### Next.js - globals.css (lines 3-41 and 61-81)
```css
@theme {
  /* Light mode colors (default) */
  --color-background: oklch(100% 0 0);      /* Pure white */
  --color-foreground: oklch(3.9% 0 0);      /* Near black */
  --color-card: oklch(100% 0 0);
  --color-card-foreground: oklch(3.9% 0 0);
  --color-popover: oklch(100% 0 0);
  --color-popover-foreground: oklch(3.9% 0 0);
  --color-primary: oklch(9% 0 0);
  --color-primary-foreground: oklch(98% 0 0);
  --color-secondary: oklch(96.1% 0 0);
  --color-secondary-foreground: oklch(9% 0 0);
  --color-muted: oklch(96.1% 0 0);
  --color-muted-foreground: oklch(45.1% 0 0);
  --color-accent: oklch(96.1% 0 0);
  --color-accent-foreground: oklch(9% 0 0);
  --color-destructive: oklch(60.2% 0.1684 12.77);
  --color-destructive-foreground: oklch(98% 0 0);
  --color-border: oklch(89.8% 0 0);
  --color-input: oklch(89.8% 0 0);
  --color-ring: oklch(3.9% 0 0);
}

.dark {
  --color-background: oklch(3.9% 0 0);      /* ❌ Should be 0% */
  --color-foreground: oklch(98% 0 0);       /* ✅ Correct */
  --color-card: oklch(3.9% 0 0);            /* ❌ Should be 8% */
  --color-card-foreground: oklch(98% 0 0);  /* ✅ Correct */
  --color-popover: oklch(3.9% 0 0);         /* Popover OK */
  --color-popover-foreground: oklch(98% 0 0);
  --color-primary: oklch(98% 0 0);          /* ✅ Correct */
  --color-primary-foreground: oklch(9% 0 0);/* ✅ Correct */
  --color-secondary: oklch(14.9% 0 0);      /* ✅ Close (15%) */
  --color-secondary-foreground: oklch(98% 0 0);
  --color-muted: oklch(14.9% 0 0);          /* ❌ Should be 12% */
  --color-muted-foreground: oklch(63.9% 0 0); /* ⚠️ Should be 60% */
  --color-accent: oklch(14.9% 0 0);         /* ❌ Should be 25% */
  --color-accent-foreground: oklch(98% 0 0);
  --color-destructive: oklch(30.6% 0.1255 12.77);
  --color-destructive-foreground: oklch(98% 0 0);
  --color-border: oklch(14.9% 0 0);         /* ❌ Should be 18% */
  --color-input: oklch(14.9% 0 0);          /* ❌ Should be 18% */
  --color-ring: oklch(83.1% 0 0);           /* ❌ Should be 50% */
}
```

---

## 3. CARD COMPONENT

### Workers - components/ui/card.tsx (line 12)
```tsx
<div
  ref={ref}
  className={cn(
    "rounded-lg overflow-hidden border bg-card text-card-foreground shadow hover:shadow-lg transition-shadow",
    //  ^^^^^^^^^ rounded-lg
    className
  )}
  {...props}
/>
```

### Workers - CardContent (line 60)
```tsx
<div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
//                            ^^^^^^^^^^ Has padding
```

### Next.js - components/ui/card.tsx (line 12)
```tsx
<div
  ref={ref}
  className={cn(
    "rounded-xl overflow-hidden border bg-card text-card-foreground shadow hover:shadow-lg transition-shadow",
    //  ^^^^^^^^^^^ ❌ rounded-xl (should be rounded-lg)
    className
  )}
  {...props}
/>
```

### Next.js - CardContent (line 60)
```tsx
<div ref={ref} className={className} {...props} />
//                       ^^^^^^^^^^^^ ❌ No default padding
```

---

## 4. TABLE COMPONENT

### Workers - Table components (lines 59, 73)
```tsx
// TableHead
<th
  ref={ref}
  className={cn(
    'h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0',
    // ^^^^^^^^ h-12 px-4
    className
  )}
  {...props}
/>

// TableCell
<td
  ref={ref}
  className={cn('p-4 align-middle [&:has([role=checkbox])]:pr-0', className)}
  //            ^^^^ p-4
  {...props}
/>
```

### Next.js - Table components (lines 76, 91)
```tsx
// TableHead
<th
  ref={ref}
  className={cn(
    'h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
    // ^^^^^^^^^ ❌ h-10 px-2 (should be h-12 px-4)
    className
  )}
  {...props}
/>

// TableCell
<td
  ref={ref}
  className={cn(
    'p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
    // ^^^ ❌ p-2 (should be p-4)
    className
  )}
  {...props}
/>
```

---

## 5. LABEL COMPONENT

### Workers - components/ui/label.tsx
```tsx
import * as React from "react";
import { cn } from "../../lib/utils";

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
          className
        )}
        {...props}
      />
    );
  }
);
```

### Next.js - components/ui/label.tsx
```tsx
"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";  // ⚠️ Uses Radix
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
```

**Note**: Next.js uses Radix UI's Label primitive, Workers uses plain label. Styling is identical but implementation differs.

---

## 6. BUTTON COMPONENT

### Workers - components/ui/button.tsx (lines 13-35)
```tsx
const classes = cn(
  "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
  {
    "bg-primary text-primary-foreground hover:bg-primary/90":
      variant === "default",
    "bg-secondary text-secondary-foreground hover:bg-secondary/80":
      variant === "secondary",
    "border border-input hover:bg-accent hover:text-accent-foreground":
      variant === "outline",
    "hover:bg-accent hover:text-accent-foreground":
      variant === "ghost",
    "underline-offset-4 hover:underline text-primary":
      variant === "link",
    "bg-destructive text-destructive-foreground hover:bg-destructive/90":
      variant === "destructive",
  },
  {
    "h-10 py-2 px-4 rounded": size === "default",
    "h-9 px-3 rounded": size === "sm",
    "h-11 px-8 rounded": size === "lg",
  },
  className
);
```

### Next.js - components/ui/button.tsx (lines 7-34)
```tsx
const buttonVariants = cva(
  "inline-flex items-center rounded justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "h-10 w-10",  // ℹ️ Next.js has icon size
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
```

**Note**: Functionally equivalent, just different implementation approach (manual classes vs CVA).

---

## 7. GAMES PAGE LAYOUT

### Workers - routes/games.tsx (lines 54-61)
```tsx
<section className="text-center py-3 lg:py-12">
  <Heading className="text-2xl lg:text-5xl lg:mb-6 mb-2">
    What are you playing?
  </Heading>
  <p className="text-lg lg:text-xl mb-4 lg:mb-8 text-muted-foreground">
    Select your game to start getting answers about the rules.
  </p>
</section>
```

### Next.js - app/games/page.tsx (lines 66-73)
```tsx
<section className="text-center py-3 lg:py-12">
  <Heading className="text-2xl lg:text-5xl lg:mb-6 mb-2">
    What are you playing?
  </Heading>
  <p className="text-lg lg:text-xl mb-4 lg:mb-8 text-muted-foreground">
    Select your game to start getting answers about the rules.
  </p>
</section>
```

**Status**: ✅ Identical

---

## 8. GAME CARDS

### Workers - routes/games.tsx (lines 67-97)
```tsx
<Card
  key={game.id}
  className="relative rounded-lg overflow-hidden border-2 border-border hover:border-primary hover:scale-105 transition-all duration-200 hover:shadow-2xl hover:shadow-primary/20 group"
>
  <div className="w-full aspect-[3/2] overflow-hidden relative bg-muted flex items-center justify-center">
    {/* Image code... */}
  </div>
  <CardHeader className="py-4">
    <CardTitle className="text-center text-xl leading-tight">
      {game.name}
    </CardTitle>
  </CardHeader>
  <Link
    to={`/games/${game.slug || game.id}`}
    className="inset-0 absolute"
  />
</Card>
```

### Next.js - app/games/page.tsx (lines 79-109)
```tsx
<Card
  key={game.id}
  className="relative rounded-lg overflow-hidden border-2 border-border hover:border-primary hover:scale-105 transition-all duration-200 hover:shadow-2xl hover:shadow-primary/20 group"
>
  <div className="w-full aspect-[3/2] overflow-hidden relative bg-muted flex items-center justify-center">
    {/* Image code... */}
  </div>
  <CardHeader className="py-4">
    <CardTitle className="text-center text-xl leading-tight">
      {game.name}
    </CardTitle>
  </CardHeader>
  <Link
    href={`/games/${game.slug || game.id}`}
    className="inset-0 absolute"
  />
</Card>
```

**Status**: ✅ Identical (except Link component - to vs href)

---

## SUMMARY OF CODE DIFFERENCES

| Component | Difference | Severity |
|-----------|-----------|----------|
| Font | Inter vs Comfortaa | ❌ CRITICAL |
| Color values | HSL vs OKLCH mismatches | ❌ CRITICAL |
| Card radius | rounded-xl vs rounded-lg | 🔸 HIGH |
| CardContent padding | Missing vs p-6 pt-0 | 🔸 HIGH |
| Table padding | Smaller in Next.js | ⚠️ MEDIUM |
| Label impl | Plain vs Radix | ℹ️ Low (visual match) |
| Button impl | Manual vs CVA | ✅ OK (visual match) |
| Layout | Identical | ✅ OK |
| Games page | Identical | ✅ OK |
| Header | Identical | ✅ OK |
