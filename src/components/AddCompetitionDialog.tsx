

"use client";

import React, { useState } from 'react';
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
import { useFirestore } from '@/firebase/provider';
import { doc, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';

interface AddCompetitionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function AddCompetitionDialog({ isOpen, onOpenChange }: AddCompetitionDialogProps) {
  const [leagueId, setLeagueId] = useState('');
  const [loading, setLoading] = useState(false);
  const { db } = useFirestore();
  const { toast } = useToast();

  const handleAdd = async () => {
    if (!leagueId.trim() || !db) {
      toast({ variant: 'destructive', title: 'خطأ', description: 'يرجى إدخال معرف البطولة.' });
      return;
    }
    setLoading(true);
    try {
      // Fetch league details from API to save in our DB
      const res = await fetch(`/api/football/leagues?id=${leagueId}`);
      if (!res.ok) throw new Error('Failed to fetch from API');
      const data = await res.json();
      
      if (data.response && data.response.length > 0) {
        const { league, country } = data.response[0];
        const newCompetition = {
          leagueId: league.id,
          name: league.name,
          logo: league.logo,
          countryName: country.name,
          countryFlag: country.flag,
        };
        
        const docRef = doc(db, 'managedCompetitions', String(league.id));
        await setDoc(docRef, newCompetition);
        
        toast({ title: 'نجاح', description: `تمت إضافة بطولة "${league.name}" بنجاح.` });
        onOpenChange(false);
        setLeagueId('');

      } else {
        toast({ variant: 'destructive', title: 'خطأ', description: 'لم يتم العثور على بطولة بهذا المعرف.' });
      }
    } catch (error) {
      console.error("Error adding competition:", error);
      const permissionError = new FirestorePermissionError({ path: `managedCompetitions/${leagueId}`, operation: 'create', requestResourceData: { leagueId } });
      errorEmitter.emit('permission-error', permissionError);
      toast({ variant: 'destructive', title: 'حدث خطأ', description: 'فشل في جلب بيانات البطولة من المصدر أو حفظها.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>إضافة بطولة جديدة</DialogTitle>
          <DialogDescription>
            أدخل معرّف البطولة (League ID) من API-Football لإضافتها إلى القائمة المُدارة.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="leagueId">معرف البطولة</Label>
            <Input
              id="leagueId"
              type="number"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              placeholder="e.g., 39"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">إلغاء</Button>
          </DialogClose>
          <Button type="submit" onClick={handleAdd} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "إضافة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
