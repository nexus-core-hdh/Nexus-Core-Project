import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { branches: true, _count: { select: { users: true } } },
    });
    if (!company) throw new NotFoundException('Company not found');
    return { data: company };
  }

  async updateCompany(companyId: string, dto: UpdateCompanyDto) {
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: dto,
    });
    return { data: company, message: 'Company updated' };
  }

  async updateMetaConfig(companyId: string, metaAppId: string, metaAppSecret: string) {
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: { metaAppId, metaAppSecret },
    });
    return { data: company, message: 'Meta config updated' };
  }
}
