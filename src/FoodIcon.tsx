import type { ReactNode } from "react";
import type { FoodIconCategory, Product } from "./types";
import { foodCategoryLabel, resolveFoodCategory, type FoodIconSource } from "./foodCategories";

const outline = "#34382e";
const cream = "#fff1cd";
const orange = "#f3b660";
const green = "#aacb69";
const coral = "#e38c80";

function Box({ category }: { category: "cereals" | "flakes" | "pasta" }) {
  const color = { cereals: "#c8d979", flakes: "#e9ac81", pasta: "#98bce0" }[category];
  return <>
    <path d="M17 14 39 10 49 18 27 22Z" fill={cream} />
    <path d="m39 10 10 8v34l-10 5Z" fill={color} />
    <path d="m17 14 22 4v39l-22-4Z" fill={color} />
    <path d="m17 14 22 4 10-0M39 18v39" fill="none" opacity=".4" />
    <path d="m22 23 12 2m-12 3 9 2" stroke={cream} strokeWidth="2.5" />
    <path d="m22 34 12 2v13l-12-2Z" fill={cream} stroke="none" />
    {category === "pasta" ? <g stroke="#d3a249" strokeWidth="2"><path d="m25 39 6 1m-6 3 6 1m-6-1 6-3m-6 0 6 6" /></g> :
      <g fill={category === "cereals" ? "#9c864e" : "#d7a25a"} stroke="none">
        <ellipse cx="26" cy="39" rx="1.8" ry="2.7" transform="rotate(-30 26 39)" />
        <ellipse cx="30" cy="43" rx="1.8" ry="2.7" transform="rotate(25 30 43)" />
        <ellipse cx="25" cy="44" rx="1.4" ry="2.1" transform="rotate(20 25 44)" />
      </g>}
  </>;
}

function Sandwich({ category }: { category: FoodIconCategory }) {
  return <>
    <path d="M12 44 31 17l23 29-22 9Z" fill={orange} />
    <path d="m13 37 18-22 23 25-22 10Z" fill={green} />
    <path d="m15 35 16-20 21 22-20 10Z" fill={category === "sandwich-sausage" ? coral : cream} />
    {category === "sandwich-sausage" ? <g fill="#bf665b" stroke="none"><circle cx="28" cy="31" r="3" /><circle cx="37" cy="34" r="3.5" /><circle cx="28" cy="40" r="2.5" /></g> : category === "sandwich-chicken" ?
      <g fill="#d9af7f" stroke="none"><path d="m24 29 9 4-3 4-9-4Z" /><path d="m34 34 9 4-4 4-8-4Z" /></g> :
      <g fill={coral} stroke="none"><circle cx="28" cy="32" r="4" /><circle cx="37" cy="37" r="4" /></g>}
    <path d="M12 29 31 9l23 26-22 9Z" fill={cream} />
    <path d="m16 28 15-15 17 20-16 7Z" fill="#f6d693" stroke="none" />
    <path d="m26 25 2 1m5-5 2 2m2 8 2 1" stroke="#cca466" />
  </>;
}

function Drawing({ category }: { category: FoodIconCategory }): ReactNode {
  switch (category) {
    case "cereals": case "flakes": case "pasta": return <Box category={category} />;
    case "sandwich": case "sandwich-chicken": case "sandwich-sausage": return <Sandwich category={category} />;
    case "cheese": return <>
      <path d="M12 30 39 15l14 21-1 15-40-7Z" fill="#e6b94f" />
      <path d="m12 30 27-15 14 21-21-2Z" fill="#ffdc76" />
      <path d="M12 30v14l40 7V36Z" fill="#f4c65e" />
      <g fill="#cc953c" stroke="none"><ellipse cx="23" cy="38" rx="3" ry="2.5" /><ellipse cx="43" cy="43" rx="3.5" ry="3" /><ellipse cx="34" cy="28" rx="3" ry="2" /></g>
    </>;
    case "sausage": return <>
      <path d="m13 35-4-4 5-4 4 4m30 9 6 1-1 6-6-2" fill={cream} />
      <path d="M16 29c7-6 28 0 35 10l-8 9c-6-7-20-12-28-9Z" fill="#cf796d" />
      <ellipse cx="17" cy="34" rx="7" ry="9" fill="#f0aa99" transform="rotate(20 17 34)" />
      <g fill={cream} stroke="none"><circle cx="16" cy="30" r="1.6" /><circle cx="19" cy="35" r="1.5" /><circle cx="14" cy="37" r="1.4" /></g>
      <path d="m29 29-3 8m10-5-4 8m11-4-5 8" opacity=".3" />
    </>;
    case "poultry": return <>
      <path d="m39 38 10 9c4-2 8 0 8 3 0 2-2 4-5 4-1 4-5 5-7 2-1-2 0-4 0-5L35 42Z" fill={cream} />
      <path d="M16 15c13-7 29 5 30 16 0 9-9 15-18 14-10-1-18-12-18-19 0-5 2-9 6-11Z" fill="#d59864" />
      <path d="M18 21c5-4 13-2 17 3" stroke="#f6d09d" strokeWidth="4" />
      <path d="m17 31 2 3m8-1 2 3m7-5 2 2" stroke="#a76b48" />
    </>;
    case "meat": return <>
      <path d="M15 22c7-9 25-8 33-2 8 7 9 17 2 24-5 7-14 7-21 3-4-3-12 0-16-5-5-6-3-14 2-20Z" fill={cream} />
      <path d="M20 24c6-5 19-5 25 0 5 5 7 12 2 17-4 5-11 4-16 1-5-3-11 0-14-4-3-3-1-10 3-14Z" fill={coral} />
      <path d="m23 23 7 11-1 8m1-8 11-10m-8 9 14 6" stroke="#fac6b1" strokeWidth="2.5" />
    </>;
    case "fish": return <>
      <path d="m42 30 14-12-2 26-12-9Z" fill="#a3c5d7" />
      <path d="M9 32c10-16 26-17 39 0-13 17-29 16-39 0Z" fill="#a9c8da" />
      <path d="m23 20 8-6 7 7m-15 23 8 6 7-7" fill="#7eacbd" />
      <path d="M24 23c-4 6-4 12 0 18" fill="none" />
      <circle cx="17" cy="30" r="1.6" fill={outline} stroke="none" />
      <path d="m32 28 4 4-4 4" fill="none" />
    </>;
    case "egg": return <>
      <path d="M32 10C22 10 12 29 12 40c0 11 9 16 20 16s20-5 20-16C52 29 42 10 32 10Z" fill={cream} />
      <circle cx="32" cy="39" r="11" fill="#f2c159" stroke="none" />
      <path d="M26 37c0-3 3-5 6-5" stroke="#ffe9a0" strokeWidth="3" />
    </>;
    case "sweets": return <>
      <path d="m13 22 37 0v33H13Z" fill="#d793a1" />
      <path d="M18 11h27v30H18Z" fill="#80574b" />
      <path d="M18 21h27M18 31h27M31 11v30" stroke="#b77a62" strokeWidth="2" />
      <path d="m13 31 8 4 5-3 6 5 7-4 5 4 6-3v21H13Z" fill="#e7adb3" />
      <path d="M20 46h23" stroke={cream} strokeWidth="3" />
    </>;
    case "bakery": return <>
      <path d="M12 27c0-10 9-16 20-16s20 6 20 16c0 4-2 7-5 9v17H17V36c-3-2-5-5-5-9Z" fill={orange} />
      <path d="M18 26c0-6 6-10 14-10s14 4 14 10c0 3-2 5-5 6v15H23V32c-3-1-5-3-5-6Z" fill={cream} stroke="none" />
      <path d="m27 25 1 0m8-3h1m-7 14h1m6 5h1" stroke="#d5b57d" strokeWidth="2.5" />
    </>;
    case "produce": return <>
      <path d="M33 20c-9-7-22-1-21 13 1 15 12 22 21 17 10 5 20-3 21-17 1-13-12-20-21-13Z" fill="#d99077" />
      <path d="M33 22c-1-6 1-11 4-14" fill="none" strokeWidth="3" />
      <path d="M35 17c1-8 10-11 16-7-2 7-8 10-16 7Z" fill={green} />
      <path d="M20 28c-3 5-1 12 2 15" stroke="#f2be9f" strokeWidth="3" />
    </>;
    case "dairy": return <>
      <path d="m23 11 17 0 7 11v31H17V22Z" fill="#b4cbdf" />
      <path d="M23 11v9l-6 2m6-2 24 2-7-11M40 11v9" fill={cream} />
      <path d="M17 30h30v17H17Z" fill={cream} />
      <path d="M33 32c-5 6-7 8-7 11a6 6 0 0 0 12 0c0-3-2-5-5-11Z" fill="#a3c3d9" stroke="none" />
    </>;
    case "nuts": return <>
      <path d="M9 32h46c-1 14-8 21-23 21S10 46 9 32Z" fill="#b5c68d" />
      <ellipse cx="32" cy="32" rx="23" ry="6" fill={cream} />
      <g fill="#ba9267"><ellipse cx="22" cy="24" rx="7" ry="10" transform="rotate(-27 22 24)" /><ellipse cx="36" cy="22" rx="7" ry="10" transform="rotate(20 36 22)" /><ellipse cx="43" cy="31" rx="6" ry="8" transform="rotate(53 43 31)" /></g>
      <path d="m19 19 5 9m14-12-3 11m6 1 5 5" opacity=".4" />
    </>;
    case "oil": return <>
      <path d="M26 11h12v12c0 5 10 6 10 15v16H16V38c0-9 10-10 10-15Z" fill="#a6be72" />
      <rect x="25" y="8" width="14" height="8" rx="2" fill={cream} />
      <path d="M16 35h32v14H16Z" fill={cream} />
      <path d="M32 38c-5 0-9 4-9 7 7 1 11-1 12-6m-3 7 4-8" fill={green} />
    </>;
    case "soup": return <>
      <path d="M22 20c-5-6 4-8 0-13m11 12c-5-6 4-8 0-13m10 14c-5-6 4-8 0-13" stroke="#aebfa3" fill="none" />
      <path d="M9 31h46c0 14-10 23-23 23S9 45 9 31Z" fill="#b1c7bc" />
      <ellipse cx="32" cy="31" rx="23" ry="7" fill={cream} />
      <ellipse cx="32" cy="32" rx="18" ry="4" fill="#e9bd72" stroke="none" />
      <g stroke="none"><path d="m21 30 6-1 1 3-6 1Z" fill={green} /><path d="m37 30 5 1-1 3-5-1Z" fill={coral} /></g>
      <path d="M23 54h18" strokeWidth="3" />
    </>;
    case "main": return <>
      <ellipse cx="32" cy="35" rx="26" ry="20" fill={cream} />
      <ellipse cx="32" cy="35" rx="20" ry="15" fill="#e5e3cf" stroke="none" />
      <path d="M19 26c5-5 16-4 21 1 7 8 2 17-9 18-8 0-18-11-12-19Z" fill="#c99269" />
      <path d="m24 27 6 11m1-12 6 11" stroke="#996b50" />
      <g fill={green}><circle cx="43" cy="24" r="5" /><circle cx="49" cy="29" r="4" /><circle cx="45" cy="35" r="5" /></g>
    </>;
    case "dessert": return <>
      <path d="M12 29 41 17l11 15v21H12Z" fill="#eeb7bb" />
      <path d="M12 39h40v6H12Z" fill={cream} stroke="none" />
      <path d="M12 29 41 17l11 15H12Z" fill={cream} />
      <path d="M12 29v6c3 4 7-6 11-1s8-4 13 0 10-2 16 2v-4Z" fill="#faf1df" stroke="none" />
      <circle cx="33" cy="22" r="6" fill={coral} />
      <path d="M33 16c0-4 3-6 5-7" fill="none" />
    </>;
    case "pizza": return <>
      <path d="m12 21 42-8-11 43Z" fill="#f4cc70" />
      <path d="M11 20c10-6 27-9 43-9l1 7c-17 0-27 3-39 8Z" fill="#ce965d" />
      <g fill={coral}><circle cx="32" cy="29" r="5" /><circle cx="43" cy="23" r="4" /><circle cx="41" cy="42" r="4" /></g>
      <path d="m28 22 3 1m16 9-2 3m-9 7-2-3" stroke={green} strokeWidth="3" />
    </>;
    case "burger": return <>
      <path d="M11 28c0-11 9-19 21-19s21 8 21 19Z" fill={orange} />
      <path d="m19 19 3-2m9-2 3 1m8 4 3 1" stroke={cream} strokeWidth="2.5" />
      <path d="M10 31c4-5 8 5 13 0s8 5 13 0 8 4 17 0v7H10Z" fill={green} />
      <rect x="10" y="36" width="44" height="9" rx="4" fill="#885b49" />
      <path d="m14 35 22 0 7 8 7-8" fill="#f3cf63" />
      <path d="M11 46h42c0 9-7 10-21 10S11 55 11 46Z" fill={orange} />
    </>;
    case "roll": return <>
      <path d="m15 24 23-12 17 26-24 18Z" fill={cream} />
      <path d="M20 35c7-1 16-7 26-12l9 15-24 18Z" fill="#e6bd85" />
      <ellipse cx="27" cy="19" rx="14" ry="9" transform="rotate(-28 27 19)" fill={green} />
      <ellipse cx="27" cy="19" rx="10" ry="6" transform="rotate(-28 27 19)" fill={cream} stroke="none" />
      <path d="m22 21 5-7 5 4-5 6Z" fill={coral} stroke="none" />
      <path d="m29 42 4 5m4-10 4 5m-14 6 3 4" stroke="#b78b5c" />
    </>;
    default: return <>
      <rect x="14" y="15" width="36" height="39" rx="8" fill="#aebfa3" />
      <path d="M14 27h36" stroke={cream} strokeWidth="3" />
      <rect x="22" y="34" width="20" height="12" rx="3" fill={cream} stroke="none" />
      <path d="M23 15V9h18v6" fill={cream} />
    </>;
  }
}

export function FoodIcon({ food, products, size = 48, className = "", label }: {
  food: FoodIconSource;
  products?: Product[];
  size?: number;
  className?: string;
  label?: string;
}) {
  const category = resolveFoodCategory(food, products);
  if (food.image) return <img className={`food-icon food-icon-photo ${className}`} src={food.image} alt={label ?? ""} width={size} height={size} style={{ objectFit: "cover", borderRadius: "20%", flexShrink: 0 }} />;
  return <svg className={`food-icon ${className}`} viewBox="0 0 64 64" width={size} height={size} role={label ? "img" : undefined} aria-label={label ? `${label}: ${foodCategoryLabel(category)}` : undefined} aria-hidden={label ? undefined : true} focusable="false" style={{ flexShrink: 0 }}>
    <ellipse cx="32" cy="57" rx="22" ry="3" fill="#10130e" opacity=".09" />
    <g stroke={outline} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><Drawing category={category} /></g>
  </svg>;
}
