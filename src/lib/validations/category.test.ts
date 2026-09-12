import { describe, expect, it } from "vitest";
import { categorySchema, subcategorySchema } from "@/lib/validations/category";

describe("categorySchema", () => {
  it("accepts a valid category", () => {
    const result = categorySchema.safeParse({
      name: "Groceries",
      type: "EXPENSE",
      color: "coral",
      icon: "shopping-cart",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid type", () => {
    const result = categorySchema.safeParse({
      name: "Groceries",
      type: "NOT_A_TYPE",
      color: "coral",
      icon: "shopping-cart",
    });
    expect(result.success).toBe(false);
  });
});

describe("subcategorySchema", () => {
  it("accepts a valid subcategory", () => {
    const result = subcategorySchema.safeParse({ name: "Produce", categoryId: "cat-1" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = subcategorySchema.safeParse({ name: "", categoryId: "cat-1" });
    expect(result.success).toBe(false);
  });
});
