'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface LiveThoughtFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadThoughtToCanvas?: (thought: any) => void;
}

export const LiveThoughtFeedModal: React.FC<LiveThoughtFeedModalProps> = ({
  isOpen,
  onClose,
}) => {
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      onClose();
      router.push('/feed');
    }
  }, [isOpen, onClose, router]);

  return null;
};
