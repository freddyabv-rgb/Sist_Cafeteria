import { Recipe } from '../domain/recipe.entity';
import { ModifierRecipeImpact } from '../domain/modifier-impact.entity';
import { PackagingRule } from '../domain/packaging-rule.entity';

export interface IRecipeRepository {
  // Recetas Base
  saveRecipe(recipe: Recipe): Promise<void>;
  findRecipeByVariantId(storeId: string, productVariantId: string): Promise<Recipe | null>;
  findAllRecipes(storeId: string): Promise<Recipe[]>;

  // Impacto de Modificadores
  saveModifierImpact(impact: ModifierRecipeImpact): Promise<void>;
  findModifierImpactByOptionId(storeId: string, modifierOptionId: string): Promise<ModifierRecipeImpact | null>;
  findAllModifierImpacts(storeId: string): Promise<ModifierRecipeImpact[]>;

  // Reglas de Empaque Descartable
  savePackagingRule(rule: PackagingRule): Promise<void>;
  findPackagingRuleByVariantId(storeId: string, productVariantId: string): Promise<PackagingRule | null>;
  findAllPackagingRules(storeId: string): Promise<PackagingRule[]>;
}
