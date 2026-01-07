"use client";

import React, { useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Textarea } from '@nextui-org/react';

interface TextInputProps {
  isOpen: boolean;
  initialText: string;
  onClose: () => void;
  onSave: (text: string) => void;
}

export function TextInput({ isOpen, initialText, onClose, onSave }: TextInputProps) {
  const [text, setText] = useState(initialText);
  
  const handleSave = () => {
    onSave(text);
    onClose();
  };
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      backdrop="blur"
      classNames={{
        backdrop: 'bg-slate-900/50',
        base: 'bg-white/95 backdrop-blur-xl border border-white/60',
      }}
    >
      <ModalContent>
        <ModalHeader className="text-slate-900">Edit Text</ModalHeader>
        <ModalBody>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter text..."
            minRows={3}
            maxRows={8}
            classNames={{
              input: 'text-slate-900',
              inputWrapper: 'bg-white/70 border border-white/60',
            }}
            autoFocus
          />
        </ModalBody>
        <ModalFooter>
          <Button
            size="sm"
            variant="flat"
            onPress={onClose}
            className="bg-white/70 border border-white/60"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onPress={handleSave}
            className="bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400 text-slate-900 font-semibold"
          >
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

