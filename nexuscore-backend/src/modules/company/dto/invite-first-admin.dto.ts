import { ApiProperty, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import { CreateUserDto } from '../../users/dto/create-user.dto';

// Create First Admin (POST /companies/:id/first-admin) — the Users screen's own fields and
// validation (CreateUserDto: name, email, password, phone, department), nothing more. The company
// is the route's target (checked server-side), the branch is that company's Main Branch and the
// role is the system Admin role — none of them can be sent. The email is stored trimmed and
// lowercased, the form sign-in looks it up in.
export class CreateFirstAdminDto extends PickType(CreateUserDto, ['name', 'email', 'password', 'phone', 'department'] as const) {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  declare email: string;
}
