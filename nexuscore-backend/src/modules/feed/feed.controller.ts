import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AllowAuthenticated, PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeedService } from './feed.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Feed')
@PermissionModule('collaboration', 'Collaboration')
@Controller('feed')
export class FeedController {
  constructor(private readonly svc: FeedService) {}

  @Get()
  @ApiOperation({ summary: 'Get feed posts' })
  getPosts(@CurrentUser() u: any, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.svc.getPosts(u.companyId, u.branchId, skip ? +skip : 0, take ? +take : 20);
  }

  @Get(':id')
  getPost(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getPost(id, u.companyId); }

  @Post()
  createPost(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createPost(dto, u.id, u.companyId, u.branchId); }

  @Patch(':id')
  updatePost(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.updatePost(id, dto, u.companyId); }

  @Delete(':id')
  deletePost(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.deletePost(id, u.companyId); }

  // A personal reaction (toggles the caller's own like), not content creation.
  @AllowAuthenticated()
  @Post(':id/like')
  toggleLike(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.toggleLike(id, u.id); }

  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.addComment(id, dto, u.id); }

  @Delete('comments/:id')
  deleteComment(@Param('id') id: string) { return this.svc.deleteComment(id); }
}
