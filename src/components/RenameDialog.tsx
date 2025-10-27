
"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from './ui/textarea';
import { useAdmin } from '@/firebase/provider';

type ItemType = 'league' | 'team' | 'player' | 'continent' | 'country' | 'coach' | 'status' | 'crown';

interface RenameDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  item?: {
    id: string | number;
    name: string;
    note?: string;
    type: ItemType;
    purpose: 'rename' | 'note' | 'crown';
    originalData?: any;
    originalName?: string;
  } | null;
  onSave: (type: ItemType, id: string | number, newName: string, newNote?: string) => void;
}

export function RenameDialog({
  isOpen,
  onOpenChange,
  item,
  onSave,
}: RenameDialogProps) {
  const [newName, setNewName] = useState('');
  const [newNote, setNewNote] = useState('');
  const { isAdmin } = useAdmin();

  useEffect(() => {
    if (isOpen && item) {
      setNewName(item.name || '');
      setNewNote(item.note || '');
    } else if (!isOpen) {
        setNewName('');
        setNewNote('');
    }
  }, [item, isOpen]);

  const handleSave = () => {
    if (item) {
        onSave(item.type, item.id, newName, newNote);
    }
    onOpenChange(false);
  };

  const itemTypeMap: Record<ItemType, string> = {
    league: 'البطولة',
    team: 'الفريق',
    player: 'اللاعب',
    continent: 'القارة',
    country: 'الدولة',
    coach: 'المدرب',
    status: 'الحالة',
    crown: 'الفريق',
  };

  const getTitle = () => {
    if (!item) return '';
    if (item.purpose === 'crown') return `تتويج ${item.name}`;
    if (item.purpose === 'note') return `إضافة ملاحظة على ${item.name}`;
    if (item.type === 'status') return 'تغيير حالة المباراة المخصصة';
    return `تعديل اسم ${itemTypeMap[item.type]}`;
  }
  
  const getDescription = () => {
      if (!item) return '';
      if(item.purpose === 'crown') return 'أضف ملاحظة خاصة لهذا الفريق المتوج لعرضها في قسم "ملعبي".'
      if(item.purpose === 'note') return 'سيتم حفظ هذا العنصر مع ملاحظتك في قسم "بلدي".';
      if(item.type === 'status') return 'اكتب الحالة التي تريد عرضها للمباراة قبل بدئها (مثال: "قناة العرض: الرابعة"). اترك الحقل فارغًا للإزالة.';
      if(isAdmin && item.purpose === 'rename') {
        const originalName = item?.originalName || item?.name;
        return `الاسم الأصلي: ${originalName}. اتركه فارغًا للعودة للاسم الأصلي.`;
      }
      return '';
  }

  const showNameField = (isAdmin && item?.purpose === 'rename') || item?.type === 'status';
  const showNoteField = item?.purpose === 'note' || item?.purpose === 'crown';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
             {getTitle()}
          </DialogTitle>
           <DialogDescription>
             {getDescription()}
           </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          
          {showNameField && (
            <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="name">
                    {item?.type === 'status' ? 'الحالة المخصصة' : 'الاسم المخصص (للترجمة)'}
                </Label>
                <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={item?.type === 'status' ? 'مثال: منقولة على الرابعة' : 'الاسم الجديد'}
                />
            </div>
          )}

          {showNoteField && (
            <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="note">ملاحظة (اختياري)</Label>
                <Textarea 
                    id="note"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="اكتب ملاحظتك الشخصية هنا..."
                />
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              إلغاء
            </Button>
          </DialogClose>
          <Button type="submit" onClick={handleSave}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    