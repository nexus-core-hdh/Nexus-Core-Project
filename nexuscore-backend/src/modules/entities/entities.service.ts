import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { visibleScopeWhere } from './custom-fields.service';

type DefaultField = {
  name: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'number' | 'url' | 'image' | 'date' | 'boolean' | 'relation';
  required?: boolean;
  options?: string[];
  isSystem?: boolean; // true = auto-managed, not editable in forms
};

const ENTITY_DEFAULT_FIELDS: Record<string, DefaultField[]> = {
  // ── CRM & Sales ────────────────────────────────────────────────────────────
  Lead: [
    { name: 'name',       label: 'Full Name',    type: 'text',     required: true },
    { name: 'email',      label: 'Email',        type: 'email' },
    { name: 'phone',      label: 'Phone',        type: 'phone' },
    { name: 'company',    label: 'Company',      type: 'text' },
    { name: 'jobTitle',   label: 'Job Title',    type: 'text' },
    { name: 'status',     label: 'Status',       type: 'select', options: ['new', 'contacted', 'qualified', 'converted', 'lost'] },
    { name: 'source',     label: 'Source',       type: 'text' },
    { name: 'value',      label: 'Estimated Value', type: 'number' },
    { name: 'notes',      label: 'Notes',        type: 'textarea' },
    { name: 'assignedTo', label: 'Assigned To',  type: 'relation' },
    { name: 'createdAt',  label: 'Created At',   type: 'date', isSystem: true },
  ],
  Deal: [
    { name: 'title',       label: 'Deal Title',   type: 'text',   required: true },
    { name: 'value',       label: 'Deal Value',   type: 'number', required: true },
    { name: 'currency',    label: 'Currency',     type: 'text' },
    { name: 'stage',       label: 'Stage',        type: 'select', options: ['prospect', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] },
    { name: 'probability', label: 'Probability %',type: 'number' },
    { name: 'closeDate',   label: 'Close Date',   type: 'date' },
    { name: 'contactId',   label: 'Contact',      type: 'relation' },
    { name: 'companyId',   label: 'Company',      type: 'relation' },
    { name: 'assignedTo',  label: 'Owner',        type: 'relation' },
    { name: 'notes',       label: 'Notes',        type: 'textarea' },
    { name: 'createdAt',   label: 'Created At',   type: 'date', isSystem: true },
  ],
  Contact: [
    { name: 'firstName',  label: 'First Name',  type: 'text', required: true },
    { name: 'lastName',   label: 'Last Name',   type: 'text', required: true },
    { name: 'email',      label: 'Email',       type: 'email' },
    { name: 'phone',      label: 'Phone',       type: 'phone' },
    { name: 'mobile',     label: 'Mobile',      type: 'phone' },
    { name: 'jobTitle',   label: 'Job Title',   type: 'text' },
    { name: 'department', label: 'Department',  type: 'text' },
    { name: 'companyId',  label: 'Company',     type: 'relation' },
    { name: 'address',    label: 'Address',     type: 'textarea' },
    { name: 'notes',      label: 'Notes',       type: 'textarea' },
    { name: 'createdAt',  label: 'Created At',  type: 'date', isSystem: true },
  ],
  Company: [
    { name: 'name',        label: 'Company Name',  type: 'text',   required: true },
    { name: 'industry',    label: 'Industry',      type: 'text' },
    { name: 'website',     label: 'Website',       type: 'url' },
    { name: 'phone',       label: 'Phone',         type: 'phone' },
    { name: 'email',       label: 'Email',         type: 'email' },
    { name: 'address',     label: 'Address',       type: 'textarea' },
    { name: 'employees',   label: 'No. Employees', type: 'number' },
    { name: 'revenue',     label: 'Annual Revenue',type: 'number' },
    { name: 'type',        label: 'Company Type',  type: 'select', options: ['prospect', 'customer', 'partner', 'vendor'] },
    { name: 'notes',       label: 'Notes',         type: 'textarea' },
    { name: 'createdAt',   label: 'Created At',    type: 'date', isSystem: true },
  ],
  Customer: [
    { name: 'name',        label: 'Name',          type: 'text',  required: true },
    { name: 'email',       label: 'Email',         type: 'email', required: true },
    { name: 'phone',       label: 'Phone',         type: 'phone' },
    { name: 'address',     label: 'Address',       type: 'textarea' },
    { name: 'creditLimit', label: 'Credit Limit',  type: 'number' },
    { name: 'discount',    label: 'Discount %',    type: 'number' },
    { name: 'taxNumber',   label: 'Tax Number',    type: 'text' },
    { name: 'notes',       label: 'Notes',         type: 'textarea' },
    { name: 'isActive',    label: 'Active',        type: 'boolean' },
    { name: 'createdAt',   label: 'Created At',    type: 'date', isSystem: true },
  ],
  Supplier: [
    { name: 'name',      label: 'Supplier Name', type: 'text',  required: true },
    { name: 'email',     label: 'Email',         type: 'email' },
    { name: 'phone',     label: 'Phone',         type: 'phone' },
    { name: 'address',   label: 'Address',       type: 'textarea' },
    { name: 'taxNumber', label: 'Tax Number',    type: 'text' },
    { name: 'paymentTerms', label: 'Payment Terms', type: 'text' },
    { name: 'currency',  label: 'Currency',      type: 'text' },
    { name: 'notes',     label: 'Notes',         type: 'textarea' },
    { name: 'isActive',  label: 'Active',        type: 'boolean' },
    { name: 'createdAt', label: 'Created At',    type: 'date', isSystem: true },
  ],
  // ── Finance ────────────────────────────────────────────────────────────────
  Order: [
    { name: 'orderNumber', label: 'Order Number', type: 'text',   required: true },
    { name: 'customerId',  label: 'Customer',     type: 'relation', required: true },
    { name: 'status',      label: 'Status',       type: 'select', options: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'] },
    { name: 'totalAmount', label: 'Total Amount', type: 'number' },
    { name: 'discount',    label: 'Discount',     type: 'number' },
    { name: 'tax',         label: 'Tax',          type: 'number' },
    { name: 'shippingAddress', label: 'Shipping Address', type: 'textarea' },
    { name: 'notes',       label: 'Notes',        type: 'textarea' },
    { name: 'orderDate',   label: 'Order Date',   type: 'date' },
    { name: 'deliveryDate',label: 'Delivery Date',type: 'date' },
    { name: 'createdAt',   label: 'Created At',   type: 'date', isSystem: true },
  ],
  Invoice: [
    { name: 'invoiceNumber',label: 'Invoice Number',type: 'text',   required: true },
    { name: 'customerId',   label: 'Customer',      type: 'relation', required: true },
    { name: 'status',       label: 'Status',        type: 'select', options: ['draft', 'sent', 'paid', 'overdue', 'cancelled'] },
    { name: 'totalAmount',  label: 'Total Amount',  type: 'number', required: true },
    { name: 'tax',          label: 'Tax',           type: 'number' },
    { name: 'discount',     label: 'Discount',      type: 'number' },
    { name: 'issueDate',    label: 'Issue Date',    type: 'date' },
    { name: 'dueDate',      label: 'Due Date',      type: 'date' },
    { name: 'notes',        label: 'Notes',         type: 'textarea' },
    { name: 'createdAt',    label: 'Created At',    type: 'date', isSystem: true },
  ],
  CustomerPayment: [
    { name: 'customerId',   label: 'Customer',      type: 'relation', required: true },
    { name: 'amount',       label: 'Amount',        type: 'number',   required: true },
    { name: 'method',       label: 'Payment Method',type: 'select', options: ['cash', 'bank_transfer', 'credit_card', 'cheque', 'online'] },
    { name: 'reference',    label: 'Reference',     type: 'text' },
    { name: 'paymentDate',  label: 'Payment Date',  type: 'date' },
    { name: 'notes',        label: 'Notes',         type: 'textarea' },
    { name: 'createdAt',    label: 'Created At',    type: 'date', isSystem: true },
  ],
  SupplierPayment: [
    { name: 'supplierId',   label: 'Supplier',      type: 'relation', required: true },
    { name: 'amount',       label: 'Amount',        type: 'number',   required: true },
    { name: 'method',       label: 'Payment Method',type: 'select', options: ['cash', 'bank_transfer', 'credit_card', 'cheque', 'online'] },
    { name: 'reference',    label: 'Reference',     type: 'text' },
    { name: 'paymentDate',  label: 'Payment Date',  type: 'date' },
    { name: 'notes',        label: 'Notes',         type: 'textarea' },
    { name: 'createdAt',    label: 'Created At',    type: 'date', isSystem: true },
  ],
  // ── Products ───────────────────────────────────────────────────────────────
  Product: [
    { name: 'name',        label: 'Product Name',  type: 'text',   required: true },
    { name: 'sku',         label: 'SKU',           type: 'text' },
    { name: 'barcode',     label: 'Barcode',       type: 'text' },
    { name: 'price',       label: 'Price',         type: 'number', required: true },
    { name: 'cost',        label: 'Cost Price',    type: 'number' },
    { name: 'stock',       label: 'Stock',         type: 'number' },
    { name: 'unit',        label: 'Unit',          type: 'text' },
    { name: 'categoryId',  label: 'Category',      type: 'relation' },
    { name: 'description', label: 'Description',   type: 'textarea' },
    { name: 'image',       label: 'Image',         type: 'image' },
    { name: 'isActive',    label: 'Active',        type: 'boolean' },
    { name: 'createdAt',   label: 'Created At',    type: 'date', isSystem: true },
  ],
  // ── Users ──────────────────────────────────────────────────────────────────
  User: [
    { name: 'name',      label: 'Full Name', type: 'text',  required: true },
    { name: 'email',     label: 'Email',     type: 'email', required: true },
    { name: 'phone',     label: 'Phone',     type: 'phone' },
    { name: 'avatar',    label: 'Avatar',    type: 'image' },
    { name: 'jobTitle',  label: 'Job Title', type: 'text' },
    { name: 'department',label: 'Department',type: 'text' },
    { name: 'isActive',  label: 'Active',    type: 'boolean' },
    { name: 'createdAt', label: 'Created At',type: 'date', isSystem: true },
  ],
  Employee: [
    { name: 'name',         label: 'Full Name',      type: 'text',   required: true },
    { name: 'employeeId',   label: 'Employee ID',    type: 'text' },
    { name: 'email',        label: 'Email',          type: 'email' },
    { name: 'phone',        label: 'Phone',          type: 'phone' },
    { name: 'jobTitle',     label: 'Job Title',      type: 'text' },
    { name: 'department',   label: 'Department',     type: 'text' },
    { name: 'hireDate',     label: 'Hire Date',      type: 'date' },
    { name: 'salary',       label: 'Salary',         type: 'number' },
    { name: 'isActive',     label: 'Active',         type: 'boolean' },
    { name: 'createdAt',    label: 'Created At',     type: 'date', isSystem: true },
  ],
  // ── Projects & Tasks ───────────────────────────────────────────────────────
  Project: [
    { name: 'name',        label: 'Project Name',  type: 'text',   required: true },
    { name: 'description', label: 'Description',   type: 'textarea' },
    { name: 'status',      label: 'Status',        type: 'select', options: ['planning', 'active', 'on_hold', 'completed', 'cancelled'] },
    { name: 'priority',    label: 'Priority',      type: 'select', options: ['low', 'medium', 'high', 'critical'] },
    { name: 'startDate',   label: 'Start Date',    type: 'date' },
    { name: 'endDate',     label: 'End Date',      type: 'date' },
    { name: 'budget',      label: 'Budget',        type: 'number' },
    { name: 'managerId',   label: 'Manager',       type: 'relation' },
    { name: 'createdAt',   label: 'Created At',    type: 'date', isSystem: true },
  ],
  Todo: [
    { name: 'title',       label: 'Title',         type: 'text',   required: true },
    { name: 'description', label: 'Description',   type: 'textarea' },
    { name: 'status',      label: 'Status',        type: 'select', options: ['todo', 'in_progress', 'done'] },
    { name: 'priority',    label: 'Priority',      type: 'select', options: ['low', 'medium', 'high'] },
    { name: 'dueDate',     label: 'Due Date',      type: 'date' },
    { name: 'assignedTo',  label: 'Assigned To',   type: 'relation' },
    { name: 'createdAt',   label: 'Created At',    type: 'date', isSystem: true },
  ],
  BpmTask: [
    { name: 'title',       label: 'Title',         type: 'text',   required: true },
    { name: 'description', label: 'Description',   type: 'textarea' },
    { name: 'priority',    label: 'Priority',      type: 'select', options: ['low', 'medium', 'high', 'urgent'] },
    { name: 'entityType',  label: 'Entity Type',   type: 'text' },
    { name: 'entityId',    label: 'Entity ID',     type: 'text' },
    { name: 'assignedTo',  label: 'Assigned To',   type: 'relation' },
    { name: 'dueDate',     label: 'Due Date',      type: 'date' },
    { name: 'metadata',    label: 'Metadata',      type: 'textarea' },
    { name: 'createdAt',   label: 'Created At',    type: 'date', isSystem: true },
  ],
  // ── PLM ────────────────────────────────────────────────────────────────────
  StyleCard: [
    { name: 'styleNo',     label: 'Style No',      type: 'text',   required: true },
    { name: 'name',        label: 'Style Name',    type: 'text',   required: true },
    { name: 'season',      label: 'Season',        type: 'text' },
    { name: 'category',    label: 'Category',      type: 'text' },
    { name: 'fabric',      label: 'Fabric',        type: 'text' },
    { name: 'status',      label: 'Status',        type: 'select', options: ['draft', 'review', 'approved', 'production', 'archived'] },
    { name: 'description', label: 'Description',   type: 'textarea' },
    { name: 'image',       label: 'Image',         type: 'image' },
    { name: 'createdAt',   label: 'Created At',    type: 'date', isSystem: true },
  ],
  SampleCard: [
    { name: 'sampleNo',    label: 'Sample No',     type: 'text',   required: true },
    { name: 'styleId',     label: 'Style Card',    type: 'relation' },
    { name: 'type',        label: 'Sample Type',   type: 'text' },
    { name: 'status',      label: 'Status',        type: 'select', options: ['requested', 'in_production', 'submitted', 'approved', 'rejected'] },
    { name: 'fabric',      label: 'Fabric',        type: 'text' },
    { name: 'colour',      label: 'Colour',        type: 'text' },
    { name: 'size',        label: 'Size',          type: 'text' },
    { name: 'cost',        label: 'Cost',          type: 'number' },
    { name: 'notes',       label: 'Notes',         type: 'textarea' },
    { name: 'createdAt',   label: 'Created At',    type: 'date', isSystem: true },
  ],
  PlmOrder: [
    { name: 'orderNo',     label: 'Order No',      type: 'text',   required: true },
    { name: 'styleId',     label: 'Style',         type: 'relation' },
    { name: 'status',      label: 'Status',        type: 'select', options: ['draft', 'confirmed', 'in_production', 'completed', 'cancelled'] },
    { name: 'quantity',    label: 'Quantity',      type: 'number' },
    { name: 'deliveryDate',label: 'Delivery Date', type: 'date' },
    { name: 'notes',       label: 'Notes',         type: 'textarea' },
    { name: 'createdAt',   label: 'Created At',    type: 'date', isSystem: true },
  ],
  PlmTask: [
    { name: 'title',       label: 'Title',         type: 'text',   required: true },
    { name: 'description', label: 'Description',   type: 'textarea' },
    { name: 'priority',    label: 'Priority',      type: 'select', options: ['low', 'normal', 'high', 'urgent'] },
    { name: 'status',      label: 'Status',        type: 'select', options: ['todo', 'in_progress', 'done', 'cancelled'] },
    { name: 'assignedTo',  label: 'Assigned To',   type: 'relation' },
    { name: 'dueDate',     label: 'Due Date',      type: 'date' },
    { name: 'createdAt',   label: 'Created At',    type: 'date', isSystem: true },
  ],
  // ── Manufacturing ──────────────────────────────────────────────────────────
  CuttingOrder: [
    { name: 'orderNo',     label: 'Order No',      type: 'text',   required: true },
    { name: 'status',      label: 'Status',        type: 'select', options: ['draft', 'pending', 'approved', 'in_progress', 'completed', 'cancelled'] },
    { name: 'fabricType',  label: 'Fabric Type',   type: 'text' },
    { name: 'plannedQty',  label: 'Planned Qty',   type: 'number' },
    { name: 'actualQty',   label: 'Actual Qty',    type: 'number' },
    { name: 'plannedDate', label: 'Planned Date',  type: 'date' },
    { name: 'notes',       label: 'Notes',         type: 'textarea' },
    { name: 'createdAt',   label: 'Created At',    type: 'date', isSystem: true },
  ],
  FabricRoll: [
    { name: 'rollNo',      label: 'Roll No',       type: 'text',   required: true },
    { name: 'fabricTypeId',label: 'Fabric Type',   type: 'relation' },
    { name: 'length',      label: 'Length (m)',     type: 'number' },
    { name: 'weight',      label: 'Weight (kg)',    type: 'number' },
    { name: 'colour',      label: 'Colour',        type: 'text' },
    { name: 'supplier',    label: 'Supplier',      type: 'text' },
    { name: 'receivedDate',label: 'Received Date', type: 'date' },
    { name: 'notes',       label: 'Notes',         type: 'textarea' },
    { name: 'createdAt',   label: 'Created At',    type: 'date', isSystem: true },
  ],
  // ── Collaboration ──────────────────────────────────────────────────────────
  Note: [
    { name: 'title',       label: 'Title',         type: 'text',   required: true },
    { name: 'content',     label: 'Content',       type: 'textarea', required: true },
    { name: 'type',        label: 'Type',          type: 'select', options: ['text', 'checklist'] },
    { name: 'createdAt',   label: 'Created At',    type: 'date', isSystem: true },
  ],
  CalendarEvent: [
    { name: 'title',       label: 'Title',         type: 'text',   required: true },
    { name: 'description', label: 'Description',   type: 'textarea' },
    { name: 'startDate',   label: 'Start',         type: 'date',   required: true },
    { name: 'endDate',     label: 'End',           type: 'date' },
    { name: 'location',    label: 'Location',      type: 'text' },
    { name: 'allDay',      label: 'All Day',       type: 'boolean' },
    { name: 'createdAt',   label: 'Created At',    type: 'date', isSystem: true },
  ],
  FormTemplate: [
    { name: 'name',            label: 'Template Name',  type: 'text',   required: true },
    { name: 'description',     label: 'Description',    type: 'textarea' },
    { name: 'entityType',      label: 'Entity Type',    type: 'text' },
    { name: 'customEntityName',label: 'Custom Entity',  type: 'text' },
    { name: 'isActive',        label: 'Active',         type: 'boolean' },
    { name: 'createdAt',       label: 'Created At',     type: 'date', isSystem: true },
  ],
};

@Injectable()
export class EntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Custom Entity Pages ────────────────────────────────────────────────────

  async getCustomEntityPages(companyId: string, branchId?: string) {
    return this.prisma.customEntityPage.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}), isActive: true },
      include: { template: true },
      orderBy: { order: 'asc' },
    });
  }

  async getCustomEntityPage(id: string, companyId: string) {
    const page = await this.prisma.customEntityPage.findFirst({
      where: { id, companyId },
      include: { template: true },
    });
    if (!page) throw new NotFoundException('Custom entity page not found');
    return page;
  }

  async getCustomEntityPageBySlug(slug: string, companyId: string, branchId?: string) {
    const page = await this.prisma.customEntityPage.findFirst({
      where: { slug, companyId, ...(branchId ? { branchId } : {}) },
      include: { template: true },
    });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  async createCustomEntityPage(dto: any, companyId: string, branchId?: string) {
    return this.prisma.customEntityPage.create({
      data: { ...dto, companyId, branchId },
      include: { template: true },
    });
  }

  async updateCustomEntityPage(id: string, dto: any, companyId: string) {
    await this.getCustomEntityPage(id, companyId);
    return this.prisma.customEntityPage.update({
      where: { id },
      data: dto,
      include: { template: true },
    });
  }

  async deleteCustomEntityPage(id: string, companyId: string) {
    await this.getCustomEntityPage(id, companyId);
    return this.prisma.customEntityPage.delete({ where: { id } });
  }

  // ── Form Templates ─────────────────────────────────────────────────────────

  async getFormTemplates(companyId: string, branchId?: string, entityType?: string) {
    return this.prisma.formTemplate.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        ...(entityType ? { entityType: entityType as any } : {}),
        isActive: true,
      },
      include: { customEntityPage: true, workflow: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFormTemplate(id: string, companyId: string) {
    const template = await this.prisma.formTemplate.findFirst({
      where: { id, companyId },
      include: { customEntityPage: true, workflow: true, entityData: true },
    });
    if (!template) throw new NotFoundException('Form template not found');
    return template;
  }

  async createFormTemplate(dto: any, companyId: string, branchId?: string) {
    const template = await this.prisma.formTemplate.create({
      data: { ...dto, companyId, branchId },
      include: { customEntityPage: true },
    });

    if (dto.customEntityName && dto.entityType === 'CUSTOM') {
      await this.prisma.customEntityPage.create({
        data: {
          name: dto.customEntityName,
          slug: dto.customEntityName.toLowerCase().replace(/\s+/g, '-'),
          templateId: template.id,
          customEntityName: dto.customEntityName,
          companyId,
          branchId,
        },
      });
    }

    return this.getFormTemplate(template.id, companyId);
  }

  async updateFormTemplate(id: string, dto: any, companyId: string) {
    await this.getFormTemplate(id, companyId);
    return this.prisma.formTemplate.update({
      where: { id },
      data: dto,
      include: { customEntityPage: true },
    });
  }

  async deleteFormTemplate(id: string, companyId: string) {
    await this.getFormTemplate(id, companyId);
    return this.prisma.formTemplate.delete({ where: { id } });
  }

  // ── Entity Data ────────────────────────────────────────────────────────────

  async getEntityData(companyId: string, branchId?: string, entityType?: string, customEntityName?: string) {
    return this.prisma.entityData.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        ...(entityType ? { entityType: entityType as any } : {}),
        ...(customEntityName ? { customEntityName } : {}),
      },
      include: { template: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getEntityDataById(id: string, companyId: string) {
    const item = await this.prisma.entityData.findFirst({
      where: { id, companyId },
      include: { template: true },
    });
    if (!item) throw new NotFoundException('Entity data not found');
    return item;
  }

  async createEntityData(dto: any, companyId: string, branchId?: string) {
    return this.prisma.entityData.create({
      data: { ...dto, companyId, branchId },
      include: { template: true },
    });
  }

  async updateEntityData(id: string, dto: any, companyId: string) {
    await this.getEntityDataById(id, companyId);
    return this.prisma.entityData.update({
      where: { id },
      data: dto,
      include: { template: true },
    });
  }

  async deleteEntityData(id: string, companyId: string) {
    await this.getEntityDataById(id, companyId);
    return this.prisma.entityData.delete({ where: { id } });
  }

  // Custom fields and their values: see custom-fields.service.ts (CustomFieldsService).

  // ── Entity Schema (default fields + custom fields) ─────────────────────────

  async getEntitySchema(entityName: string, companyId?: string, branchId?: string) {
    const defaultFields = ENTITY_DEFAULT_FIELDS[entityName] ?? [];
    const customFields = await this.prisma.customField.findMany({
      where: { entity: entityName, isActive: true, ...visibleScopeWhere(companyId, branchId) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { entityName, defaultFields, customFields };
  }

  // ── Form Sections ──────────────────────────────────────────────────────────

  async getFormSections(companyId: string, branchId?: string) {
    return this.prisma.formSection.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      include: { fields: true },
      orderBy: { order: 'asc' },
    });
  }

  async createFormSection(dto: any, companyId: string, branchId?: string) {
    return this.prisma.formSection.create({
      data: { ...dto, companyId, branchId },
      include: { fields: true },
    });
  }

  async updateFormSection(id: string, dto: any) {
    return this.prisma.formSection.update({ where: { id }, data: dto, include: { fields: true } });
  }

  async deleteFormSection(id: string) {
    return this.prisma.formSection.delete({ where: { id } });
  }

  async createFormField(sectionId: string, dto: any) {
    return this.prisma.formField.create({ data: { ...dto, sectionId } });
  }

  async updateFormField(id: string, dto: any) {
    return this.prisma.formField.update({ where: { id }, data: dto });
  }

  async deleteFormField(id: string) {
    return this.prisma.formField.delete({ where: { id } });
  }
}
