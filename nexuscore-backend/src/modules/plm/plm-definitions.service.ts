import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlmDefinitionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Style Sample Types ────────────────────────────────────────────────────────
  async listSampleTypes() {
    return this.prisma.styleSampleType.findMany({ orderBy: { sequence: 'asc' } });
  }
  async createSampleType(dto: any) {
    return this.prisma.styleSampleType.create({ data: dto });
  }
  async getSampleType(id: string) {
    const r = await this.prisma.styleSampleType.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('StyleSampleType not found');
    return r;
  }
  async updateSampleType(id: string, dto: any) {
    await this.getSampleType(id);
    return this.prisma.styleSampleType.update({ where: { id }, data: dto });
  }
  async deleteSampleType(id: string) {
    await this.getSampleType(id);
    await this.prisma.styleSampleType.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ── Design Detail Types ───────────────────────────────────────────────────────
  async listDesignDetailTypes() {
    return this.prisma.designDetailType.findMany({ orderBy: { name: 'asc' } });
  }
  async createDesignDetailType(dto: any) {
    return this.prisma.designDetailType.create({ data: dto });
  }
  async getDesignDetailType(id: string) {
    const r = await this.prisma.designDetailType.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('DesignDetailType not found');
    return r;
  }
  async updateDesignDetailType(id: string, dto: any) {
    await this.getDesignDetailType(id);
    return this.prisma.designDetailType.update({ where: { id }, data: dto });
  }
  async deleteDesignDetailType(id: string) {
    await this.getDesignDetailType(id);
    await this.prisma.designDetailType.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ── Measurement Definitions ───────────────────────────────────────────────────
  async listMeasurementDefs() {
    return this.prisma.measurementDefinition.findMany({ orderBy: { sequence: 'asc' } });
  }
  async createMeasurementDef(dto: any) {
    return this.prisma.measurementDefinition.create({ data: dto });
  }
  async getMeasurementDef(id: string) {
    const r = await this.prisma.measurementDefinition.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('MeasurementDefinition not found');
    return r;
  }
  async updateMeasurementDef(id: string, dto: any) {
    await this.getMeasurementDef(id);
    return this.prisma.measurementDefinition.update({ where: { id }, data: dto });
  }
  async deleteMeasurementDef(id: string) {
    await this.getMeasurementDef(id);
    await this.prisma.measurementDefinition.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ── Measurement Charts ────────────────────────────────────────────────────────
  async listMeasurementCharts(branchId?: string) {
    return this.prisma.measurementChart.findMany({
      where: branchId ? { branchId } : undefined,
      include: { lines: { include: { measurementDefinition: true } } },
      orderBy: { name: 'asc' },
    });
  }
  async createMeasurementChart(dto: any) {
    const { lines, ...chartData } = dto;
    return this.prisma.measurementChart.create({
      data: { ...chartData, lines: lines ? { create: lines } : undefined },
      include: { lines: { include: { measurementDefinition: true } } },
    });
  }
  async getMeasurementChart(id: string) {
    const r = await this.prisma.measurementChart.findUnique({
      where: { id },
      include: { lines: { include: { measurementDefinition: true } } },
    });
    if (!r) throw new NotFoundException('MeasurementChart not found');
    return r;
  }
  async updateMeasurementChart(id: string, dto: any) {
    await this.getMeasurementChart(id);
    const { lines, ...chartData } = dto;
    return this.prisma.measurementChart.update({
      where: { id },
      data: chartData,
      include: { lines: { include: { measurementDefinition: true } } },
    });
  }
  async deleteMeasurementChart(id: string) {
    await this.getMeasurementChart(id);
    await this.prisma.measurementChart.delete({ where: { id } });
    return { message: 'Deleted' };
  }
  async upsertChartLines(chartId: string, lines: any[]) {
    await this.getMeasurementChart(chartId);
    await this.prisma.measurementChartLine.deleteMany({ where: { chartId } });
    return this.prisma.measurementChartLine.createMany({
      data: lines.map((l) => ({ ...l, chartId })),
    });
  }

  // ── Department Cards ──────────────────────────────────────────────────────────
  async listDepartments(branchId?: string) {
    return this.prisma.departmentCard.findMany({
      where: branchId ? { branchId } : undefined,
      include: { _count: { select: { employees: true, processCards: true } } },
      orderBy: { name: 'asc' },
    });
  }
  async createDepartment(dto: any) {
    return this.prisma.departmentCard.create({ data: dto });
  }
  async getDepartment(id: string) {
    const r = await this.prisma.departmentCard.findUnique({
      where: { id },
      include: { employees: true, processCards: true },
    });
    if (!r) throw new NotFoundException('DepartmentCard not found');
    return r;
  }
  async updateDepartment(id: string, dto: any) {
    await this.getDepartment(id);
    return this.prisma.departmentCard.update({ where: { id }, data: dto });
  }
  async deleteDepartment(id: string) {
    await this.getDepartment(id);
    await this.prisma.departmentCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }
  async getDepartmentEmployees(id: string) {
    return this.prisma.employeeCard.findMany({ where: { departmentId: id }, orderBy: { name: 'asc' } });
  }

  // ── Process Cards ─────────────────────────────────────────────────────────────
  async listProcessCards(departmentId?: string) {
    return this.prisma.processCard.findMany({
      where: departmentId ? { departmentId } : undefined,
      include: { department: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }
  async createProcessCard(dto: any) {
    return this.prisma.processCard.create({
      data: dto,
      include: { department: { select: { id: true, name: true } } },
    });
  }
  async getProcessCard(id: string) {
    const r = await this.prisma.processCard.findUnique({
      where: { id },
      include: { department: true },
    });
    if (!r) throw new NotFoundException('ProcessCard not found');
    return r;
  }
  async updateProcessCard(id: string, dto: any) {
    await this.getProcessCard(id);
    return this.prisma.processCard.update({ where: { id }, data: dto });
  }
  async deleteProcessCard(id: string) {
    await this.getProcessCard(id);
    await this.prisma.processCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ── Employee Cards ────────────────────────────────────────────────────────────
  async listEmployees(branchId?: string, departmentId?: string) {
    return this.prisma.employeeCard.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(departmentId ? { departmentId } : {}),
      },
      include: { department: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }
  async createEmployee(dto: any) {
    return this.prisma.employeeCard.create({
      data: dto,
      include: { department: { select: { id: true, name: true } } },
    });
  }
  async getEmployee(id: string) {
    const r = await this.prisma.employeeCard.findUnique({
      where: { id },
      include: { department: true },
    });
    if (!r) throw new NotFoundException('EmployeeCard not found');
    return r;
  }
  async updateEmployee(id: string, dto: any) {
    await this.getEmployee(id);
    return this.prisma.employeeCard.update({ where: { id }, data: dto });
  }
  async deleteEmployee(id: string) {
    await this.getEmployee(id);
    await this.prisma.employeeCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ── Resource Cards ────────────────────────────────────────────────────────────
  async listResources(branchId?: string, type?: string) {
    return this.prisma.resourceCard.findMany({
      where: { ...(branchId ? { branchId } : {}), ...(type ? { type } : {}) },
      orderBy: { name: 'asc' },
    });
  }
  async createResource(dto: any) {
    return this.prisma.resourceCard.create({ data: dto });
  }
  async getResource(id: string) {
    const r = await this.prisma.resourceCard.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('ResourceCard not found');
    return r;
  }
  async updateResource(id: string, dto: any) {
    await this.getResource(id);
    return this.prisma.resourceCard.update({ where: { id }, data: dto });
  }
  async deleteResource(id: string) {
    await this.getResource(id);
    await this.prisma.resourceCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ── Study Template Cards ──────────────────────────────────────────────────────
  async listStudyTemplates(branchId?: string, styleCardId?: string) {
    return this.prisma.studyTemplateCard.findMany({
      where: { ...(branchId ? { branchId } : {}), ...(styleCardId ? { styleCardId } : {}) },
      include: {
        lines: { include: { processCard: { select: { id: true, name: true } } }, orderBy: { sequence: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
  }
  async createStudyTemplate(dto: any, createdBy: string) {
    const { lines, ...data } = dto;
    return this.prisma.studyTemplateCard.create({
      data: { ...data, createdBy, lines: lines ? { create: lines } : undefined },
      include: { lines: { include: { processCard: true }, orderBy: { sequence: 'asc' } } },
    });
  }
  async getStudyTemplate(id: string) {
    const r = await this.prisma.studyTemplateCard.findUnique({
      where: { id },
      include: { lines: { include: { processCard: true }, orderBy: { sequence: 'asc' } } },
    });
    if (!r) throw new NotFoundException('StudyTemplateCard not found');
    return r;
  }
  async updateStudyTemplate(id: string, dto: any) {
    await this.getStudyTemplate(id);
    const { lines, ...data } = dto;
    return this.prisma.studyTemplateCard.update({ where: { id }, data });
  }
  async deleteStudyTemplate(id: string) {
    await this.getStudyTemplate(id);
    await this.prisma.studyTemplateCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }
  async upsertStudyTemplateLines(templateId: string, lines: any[]) {
    await this.getStudyTemplate(templateId);
    await this.prisma.studyTemplateLine.deleteMany({ where: { studyTemplateId: templateId } });
    return this.prisma.studyTemplateLine.createMany({
      data: lines.map((l) => ({ ...l, studyTemplateId: templateId })),
    });
  }
  async deleteStudyTemplateLine(templateId: string, lineId: string) {
    await this.prisma.studyTemplateLine.delete({ where: { id: lineId } });
    return { message: 'Line deleted' };
  }

  // ── Activity Type Cards ───────────────────────────────────────────────────────
  async listActivityTypes(branchId?: string) {
    return this.prisma.activityTypeCard.findMany({
      where: branchId ? { branchId } : undefined,
      include: { department: true, resource: true, process: true, sampleType: true },
      orderBy: { name: 'asc' },
    });
  }
  async createActivityType(dto: any) {
    return this.prisma.activityTypeCard.create({ data: dto });
  }
  async getActivityType(id: string) {
    const r = await this.prisma.activityTypeCard.findUnique({
      where: { id },
      include: { department: true, resource: true, process: true, sampleType: true },
    });
    if (!r) throw new NotFoundException('ActivityTypeCard not found');
    return r;
  }
  async updateActivityType(id: string, dto: any) {
    await this.getActivityType(id);
    return this.prisma.activityTypeCard.update({ where: { id }, data: dto });
  }
  async deleteActivityType(id: string) {
    await this.getActivityType(id);
    await this.prisma.activityTypeCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ── Color Cards ───────────────────────────────────────────────────────────────
  async listColors(branchId?: string) {
    return this.prisma.colorCard.findMany({
      where: branchId ? { branchId } : undefined,
      orderBy: { name: 'asc' },
    });
  }
  async createColor(dto: any) {
    return this.prisma.colorCard.create({ data: dto });
  }
  async getColor(id: string) {
    const r = await this.prisma.colorCard.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('ColorCard not found');
    return r;
  }
  async updateColor(id: string, dto: any) {
    await this.getColor(id);
    return this.prisma.colorCard.update({ where: { id }, data: dto });
  }
  async deleteColor(id: string) {
    await this.getColor(id);
    await this.prisma.colorCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ── Brand Cards ───────────────────────────────────────────────────────────────
  async listBrands(branchId?: string, search?: string) {
    return this.prisma.brandCard.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }
  async createBrand(dto: any) {
    return this.prisma.brandCard.create({ data: dto });
  }
  async getBrand(id: string) {
    const r = await this.prisma.brandCard.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('BrandCard not found');
    return r;
  }
  async updateBrand(id: string, dto: any) {
    await this.getBrand(id);
    return this.prisma.brandCard.update({ where: { id }, data: dto });
  }
  async deleteBrand(id: string) {
    await this.getBrand(id);
    await this.prisma.brandCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ── Season Cards ──────────────────────────────────────────────────────────────
  async listSeasons(branchId?: string, search?: string) {
    return this.prisma.seasonCard.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }
  async createSeason(dto: any) {
    return this.prisma.seasonCard.create({ data: dto });
  }
  async getSeason(id: string) {
    const r = await this.prisma.seasonCard.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('SeasonCard not found');
    return r;
  }
  async updateSeason(id: string, dto: any) {
    await this.getSeason(id);
    return this.prisma.seasonCard.update({ where: { id }, data: dto });
  }
  async deleteSeason(id: string) {
    await this.getSeason(id);
    await this.prisma.seasonCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ── Gender Cards ──────────────────────────────────────────────────────────────
  async listGenders(branchId?: string, search?: string) {
    return this.prisma.genderCard.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }
  async createGender(dto: any) {
    return this.prisma.genderCard.create({ data: dto });
  }
  async getGender(id: string) {
    const r = await this.prisma.genderCard.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('GenderCard not found');
    return r;
  }
  async updateGender(id: string, dto: any) {
    await this.getGender(id);
    return this.prisma.genderCard.update({ where: { id }, data: dto });
  }
  async deleteGender(id: string) {
    await this.getGender(id);
    await this.prisma.genderCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ── Size Cards ────────────────────────────────────────────────────────────────
  async listSizes(branchId?: string, search?: string) {
    return this.prisma.sizeCard.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { sequence: 'asc' },
    });
  }
  async createSize(dto: any) {
    return this.prisma.sizeCard.create({ data: dto });
  }
  async getSize(id: string) {
    const r = await this.prisma.sizeCard.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('SizeCard not found');
    return r;
  }
  async updateSize(id: string, dto: any) {
    await this.getSize(id);
    return this.prisma.sizeCard.update({ where: { id }, data: dto });
  }
  async deleteSize(id: string) {
    await this.getSize(id);
    await this.prisma.sizeCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ── Company Cards ─────────────────────────────────────────────────────────────
  async listCompanyCards() {
    return this.prisma.companyCard.findMany({ orderBy: { name: 'asc' } });
  }
  async createCompanyCard(dto: any) {
    return this.prisma.companyCard.create({ data: dto });
  }
  async getCompanyCard(id: string) {
    const r = await this.prisma.companyCard.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('CompanyCard not found');
    return r;
  }
  async updateCompanyCard(id: string, dto: any) {
    await this.getCompanyCard(id);
    return this.prisma.companyCard.update({ where: { id }, data: dto });
  }
  async deleteCompanyCard(id: string) {
    await this.getCompanyCard(id);
    await this.prisma.companyCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ── Sample Task Types ─────────────────────────────────────────────────────────
  async listSampleTaskTypes(branchId?: string) {
    return this.prisma.sampleTaskType.findMany({
      where: branchId ? { branchId } : undefined,
      orderBy: { sequence: 'asc' },
    });
  }
  async createSampleTaskType(dto: any) {
    return this.prisma.sampleTaskType.create({ data: dto });
  }
  async getSampleTaskType(id: string) {
    const r = await this.prisma.sampleTaskType.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('SampleTaskType not found');
    return r;
  }
  async updateSampleTaskType(id: string, dto: any) {
    await this.getSampleTaskType(id);
    return this.prisma.sampleTaskType.update({ where: { id }, data: dto });
  }
  async deleteSampleTaskType(id: string) {
    await this.getSampleTaskType(id);
    await this.prisma.sampleTaskType.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  // ── Route Cards ───────────────────────────────────────────────────────────────
  async listRouteCards(branchId?: string) {
    return this.prisma.routeCard.findMany({
      where: branchId ? { branchId } : undefined,
      include: { lines: { include: { process: true }, orderBy: { sequence: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }
  async createRouteCard(dto: any) {
    return this.prisma.routeCard.create({ data: dto });
  }
  async getRouteCard(id: string) {
    const r = await this.prisma.routeCard.findUnique({
      where: { id },
      include: { lines: { include: { process: true }, orderBy: { sequence: 'asc' } } },
    });
    if (!r) throw new NotFoundException('RouteCard not found');
    return r;
  }
  async updateRouteCard(id: string, dto: any) {
    await this.getRouteCard(id);
    return this.prisma.routeCard.update({ where: { id }, data: dto });
  }
  async deleteRouteCard(id: string) {
    await this.getRouteCard(id);
    await this.prisma.routeCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }
  async addRouteCardLine(routeCardId: string, dto: any) {
    await this.getRouteCard(routeCardId);
    return this.prisma.routeCardLine.create({ data: { ...dto, routeCardId }, include: { process: true } });
  }
  async updateRouteCardLine(lineId: string, dto: any) {
    return this.prisma.routeCardLine.update({ where: { id: lineId }, data: dto, include: { process: true } });
  }
  async deleteRouteCardLine(lineId: string) {
    await this.prisma.routeCardLine.delete({ where: { id: lineId } });
    return { message: 'Line deleted' };
  }

  // ── PLM Templates ─────────────────────────────────────────────────────────────
  async listTemplates(branchId?: string, type?: string) {
    return this.prisma.plmTemplate.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(type ? { type } : {}),
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });
  }
  async createTemplate(dto: any, createdBy: string) {
    return this.prisma.plmTemplate.create({ data: { ...dto, createdBy } });
  }
  async getTemplate(id: string) {
    const r = await this.prisma.plmTemplate.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('PlmTemplate not found');
    return r;
  }
  async updateTemplate(id: string, dto: any) {
    await this.getTemplate(id);
    return this.prisma.plmTemplate.update({ where: { id }, data: dto });
  }
  async deleteTemplate(id: string) {
    await this.getTemplate(id);
    await this.prisma.plmTemplate.delete({ where: { id } });
    return { message: 'Deleted' };
  }
  async duplicateTemplate(id: string, createdBy: string) {
    const t = await this.getTemplate(id);
    return this.prisma.plmTemplate.create({
      data: {
        name: `${t.name} (Copy)`,
        type: t.type,
        description: t.description,
        structure: t.structure ?? {},
        isDefault: false,
        isActive: t.isActive,
        branchId: t.branchId,
        createdBy,
      },
    });
  }
}
