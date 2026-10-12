"use client";

import { useState } from "react";
import { PlusIcon } from "@radix-ui/react-icons";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { NewChatDialog } from "./new-chat-dialog";
import { CreateGroupDialog } from "./create-group-dialog";

interface ActionDropdownProps {
  onChatCreated?: () => void;
}

export function ActionDropdown({ onChatCreated }: ActionDropdownProps) {
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="rounded-full">
            <PlusIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setNewChatOpen(true)}>
              New chat
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCreateGroupOpen(true)}>
              Create group
            </DropdownMenuItem>
            <DropdownMenuItem>Add contact</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewChatDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        onChatCreated={onChatCreated}
      />
      <CreateGroupDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        onGroupCreated={onChatCreated}
      />
    </>
  );
}
