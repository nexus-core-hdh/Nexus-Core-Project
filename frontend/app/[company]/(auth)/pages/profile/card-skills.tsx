"use client";

import { useEffect, useState } from "react";
import { Plus, X, Edit2, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { settingsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

export function CardSkills() {
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newSkillValue, setNewSkillValue] = useState("");

  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const user = getCurrentUser();
        if (user?.id) {
          const settings = await settingsApi.getUserSettings(user.id);
          setSkills(settings?.skills || []);
        }
      } catch (error) {
        console.error("Failed to fetch skills:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSkills();
  }, []);

  const saveSkills = async (updatedSkills: string[]) => {
    try {
      const user = getCurrentUser();
      if (!user?.id) {
        toast.error("Please log in to update skills");
        return;
      }

      await settingsApi.updateProfile(user.id, {
        skills: updatedSkills
      });

      setSkills(updatedSkills);
      toast.success("Skills updated successfully");
    } catch (error: any) {
      console.error("Failed to save skills:", error);
      toast.error("Failed to update skills", { description: error.message });
    }
  };

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setEditingValue(skills[index]);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    
    const trimmedValue = editingValue.trim();
    if (!trimmedValue) {
      toast.error("Skill cannot be empty");
      return;
    }

    const updatedSkills = [...skills];
    updatedSkills[editingIndex] = trimmedValue;
    saveSkills(updatedSkills);
    setEditingIndex(null);
    setEditingValue("");
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingValue("");
  };

  const handleDelete = (index: number) => {
    const updatedSkills = skills.filter((_, i) => i !== index);
    saveSkills(updatedSkills);
  };

  const handleAddSkill = () => {
    const trimmedValue = newSkillValue.trim();
    if (!trimmedValue) {
      toast.error("Skill cannot be empty");
      return;
    }

    if (skills.includes(trimmedValue)) {
      toast.error("This skill already exists");
      setNewSkillValue("");
      return;
    }

    const updatedSkills = [...skills, trimmedValue];
    saveSkills(updatedSkills);
    setNewSkillValue("");
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewSkillValue("");
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-center py-4 text-sm">Loading skills...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {skills.map((skill, index) => (
            <div key={index} className="flex items-center gap-1">
              {editingIndex === index ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSaveEdit();
                      } else if (e.key === "Escape") {
                        handleCancelEdit();
                      }
                    }}
                    className="h-7 w-24 px-2 text-xs"
                    autoFocus
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={handleSaveEdit}
                    className="h-7 w-7">
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={handleCancelEdit}
                    className="h-7 w-7">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Badge variant="outline" className="group relative flex items-center gap-1 pr-1 hover:pr-8">
                  <span>{skill}</span>
                  <div className="absolute right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(index);
                      }}
                      className="h-5 w-5 rounded-sm hover:bg-muted">
                      <Edit2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(index);
                      }}
                      className="h-5 w-5 rounded-sm hover:bg-muted">
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                </Badge>
              )}
            </div>
          ))}

          {isAdding ? (
            <div className="flex items-center gap-1">
              <Input
                value={newSkillValue}
                onChange={(e) => setNewSkillValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddSkill();
                  } else if (e.key === "Escape") {
                    handleCancelAdd();
                  }
                }}
                placeholder="Enter skill"
                className="h-7 w-24 px-2 text-xs"
                autoFocus
              />
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={handleAddSkill}
                className="h-7 w-7">
                <Check className="h-3 w-3" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={handleCancelAdd}
                className="h-7 w-7">
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAdding(true)}
              className="h-7 gap-1 text-xs">
              <Plus className="h-3 w-3" />
              Add Skill
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
