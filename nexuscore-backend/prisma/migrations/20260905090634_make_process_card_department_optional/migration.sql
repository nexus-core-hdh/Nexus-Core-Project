-- Allow a Process Card to be saved without a Department. The FK itself is unchanged (a
-- selected department must still be a real DepartmentCard row); only the NOT NULL requirement
-- is dropped.
ALTER TABLE "ProcessCard" ALTER COLUMN "departmentId" DROP NOT NULL;
