import { Module, OnModuleInit } from '@nestjs/common';
import { OutboxDispatcherService } from '@platform/outbox/outbox-dispatcher.service';
import { PurchasingModule } from '@modules/purchasing/purchasing.module';
import { InMemoryRecipeRepository } from './infra/recipe.in-memory.repository';
import { RecipesService } from './services/recipes.service';
import { RecipeOrderPaidHandler } from './handlers/recipe-order-paid.handler';

@Module({
  imports: [PurchasingModule],
  providers: [
    {
      provide: 'RECIPE_REPOSITORY',
      useClass: InMemoryRecipeRepository,
    },
    RecipesService,
    RecipeOrderPaidHandler,
  ],
  exports: ['RECIPE_REPOSITORY', RecipesService, RecipeOrderPaidHandler],
})
export class RecipesModule implements OnModuleInit {
  constructor(
    private readonly outboxDispatcher: OutboxDispatcherService,
    private readonly paidHandler: RecipeOrderPaidHandler,
  ) {}

  public onModuleInit(): void {
    // Suscribir deducción automática de insumos por receta al cobro de ventas en Outbox
    this.outboxDispatcher.registerHandler('order.paid.v1', this.paidHandler);
  }
}
