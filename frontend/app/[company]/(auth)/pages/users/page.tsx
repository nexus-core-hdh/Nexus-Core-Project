'use client';

import Link from "@/components/app-link";
import { useEffect, useState } from "react";
import { usersApi } from "@/lib/api";

import { Button } from "@/components/ui/button";
import UsersDataTable from "./data-table";
import { PlusCircleIcon } from "lucide-react";
import React from "react";
import { CreateUserDialog } from "./create-user-dialog";

export default function Page() {
  const [users, setUsers] = useState([]);
  const [isNewUserModalOpen, setIsNewUserModalOpen] = React.useState(false);
  const [newUserTitle, setNewUserTitle] = React.useState("");
  
  const getUsers = async () => {
    try {
      const data = await usersApi.getUsers();
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  useEffect(() => {
    getUsers();
  }, []);

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-lg font-bold tracking-tight">Users</h1>
        <CreateUserDialog
          open={isNewUserModalOpen}
          onOpenChange={setIsNewUserModalOpen}
          onSuccess={() => {
            // Refresh users list
            getUsers();
          }}
        />
        <Button onClick={() => setIsNewUserModalOpen(true)}>
          <PlusCircleIcon />
          <span className="hidden lg:inline">Create User</span>
        </Button>
      </div>
      <UsersDataTable data={users} />
    </>
  );
}
