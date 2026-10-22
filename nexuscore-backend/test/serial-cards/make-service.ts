// SerialCardService with its real collaborators (the Work Order BOM + Yarn Recipe resolution it
// reads production details through) — wired the way LegacyErpModule's DI does.
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { SerialCardService } from '../../src/modules/legacy-erp/serial-card.service';
import { WorkOrderService } from '../../src/modules/legacy-erp/work-order.service';
import { FabricYarnRecipeService } from '../../src/modules/legacy-erp/fabric-yarn-recipe.service';
import { FabricYarnRequirementsService } from '../../src/modules/legacy-erp/fabric-yarn-requirements.service';

export function makeSerialCardService(prisma: PrismaService) {
  const audit = new AuditService(prisma);
  const workOrders = new WorkOrderService(prisma, audit, null as any);
  const recipes = new FabricYarnRecipeService(prisma, null as any, null as any); // resolveEffectiveRecipe only reads prisma
  const requirements = new FabricYarnRequirementsService(prisma, workOrders, recipes, audit);
  return new SerialCardService(prisma, audit, requirements, recipes);
}
