import { useState } from "react";
import { ArrowRight, Leaf, Pencil, Trash2 } from "lucide-react";
import { FoodIcon } from "./FoodIcon";
import { scaleNutrients } from "./nutrition";
import type { Product } from "./types";
import "./productCard.css";

interface ProductCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onInsight: (product: Product) => void;
}

type AmountBasis = "100g" | "serving" | "piece";

const number = (value: number, digits = 0) =>
  value.toLocaleString("ru-RU", { maximumFractionDigits: digits });
const validWeight = (weight: number | undefined): weight is number =>
  typeof weight === "number" && Number.isFinite(weight) && weight > 0;

export function ProductCard({ product, onEdit, onDelete, onInsight }: ProductCardProps) {
  const [selectedBasis, setSelectedBasis] = useState<AmountBasis>("100g");
  const choices: { value: AmountBasis; label: string; grams: number }[] = [
    { value: "100g", label: "100 г", grams: 100 },
    ...(validWeight(product.servingGrams)
      ? [{ value: "serving" as const, label: "1 порция", grams: product.servingGrams }]
      : []),
    ...(validWeight(product.pieceGrams)
      ? [{ value: "piece" as const, label: "1 штука", grams: product.pieceGrams }]
      : []),
  ];
  // A serving can be removed while editing an existing card.
  const selected = choices.find(choice => choice.value === selectedBasis) ?? choices[0];
  const nutrients = scaleNutrients(product, selected.grams / 100);

  return (
    <article className="card product-card product-card-with-amounts">
      <div className="product-top">
        <FoodIcon food={product} size={64} />
        <span className="product-category">
          {product.custom ? "Мой продукт" : product.category}
        </span>
        <div className="product-tools">
          <button
            type="button"
            className="catalog-action"
            onClick={() => onEdit(product)}
            aria-label={`Редактировать ${product.name}`}
          >
            <Pencil size={15} />Изменить
          </button>
          <button
              type="button"
              className="catalog-action catalog-delete"
              onClick={() => onDelete(product)}
              aria-label={`Удалить ${product.name}`}
            >
              <Trash2 size={15} />Удалить
          </button>
        </div>
      </div>
      <h3>{product.name}</h3>
      <div className="product-energy" aria-live="polite" aria-atomic="true">
        <strong>{number(nutrients.kcal)}</strong> ккал <span>/ {selected.label}</span>
      </div>
      <div className="product-macros">
        <span><i className="protein-bg" />Б <b>{number(nutrients.protein, 1)}</b></span>
        <span><i className="fat-bg" />Ж <b>{number(nutrients.fat, 1)}</b></span>
        <span><i className="carbs-bg" />У <b>{number(nutrients.carbs, 1)}</b></span>
      </div>
      <button type="button" className="insight-link" onClick={() => onInsight(product)}>
        <Leaf size={14} />Что учитывать<ArrowRight size={14} />
      </button>
      {choices.length > 1 && (
        <div className="product-amount-controls" role="group" aria-label={`Количество: ${product.name}`}>
          <span className="product-amount-label">Показать для</span>
          <div className="product-amount-options">
            {choices.map(choice => (
              <button
                key={choice.value}
                type="button"
                aria-pressed={choice.value === selected.value}
                onClick={() => setSelectedBasis(choice.value)}
              >
                <span>{choice.label}</span>
                {choice.value !== "100g" && <small>{number(choice.grams, 2)} г</small>}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
