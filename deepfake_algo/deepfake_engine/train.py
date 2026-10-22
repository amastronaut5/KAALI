"""
Model Training & Fine-Tuning Pipeline for MesoNet-4
Paper: "MesoNet: a Compact Facial Video Forgery Detection Network" (Afchar et al., IEEE WIFS 2018)
Extended with Face X-Ray boundary loss (Li et al., CVPR 2020).
"""

import os
import argparse
import random
import time
from typing import Tuple, List, Optional
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from PIL import Image

from .mesonet import Meso4


class DeepfakeDataset(Dataset):
    """
    Standard PyTorch Dataset for Real vs Deepfake image classification.
    Expects directory structure:
        data_dir/
            real/
                img1.jpg, img2.png, ...
            fake/ (or deepfake/)
                fake1.jpg, fake2.png, ...
    """

    def __init__(self, root_dir: str, transform=None, sample_limit: Optional[int] = None):
        self.root_dir = root_dir
        self.transform = transform
        self.samples: List[Tuple[str, int]] = []  # (path, label: 1=real, 0=fake)

        real_dirs = [os.path.join(root_dir, d) for d in ["real", "authentic", "Real", "0"]]
        fake_dirs = [os.path.join(root_dir, d) for d in ["fake", "deepfake", "morphed", "Fake", "1"]]

        real_paths = []
        for rd in real_dirs:
            if os.path.exists(rd):
                for fname in os.listdir(rd):
                    if fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                        real_paths.append(os.path.join(rd, fname))

        fake_paths = []
        for fd in fake_dirs:
            if os.path.exists(fd):
                for fname in os.listdir(fd):
                    if fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                        fake_paths.append(os.path.join(fd, fname))

        if sample_limit:
            real_paths = real_paths[:sample_limit]
            fake_paths = fake_paths[:sample_limit]

        # MesoNet official notation: 1.0 = Real, 0.0 = Deepfake
        for p in real_paths:
            self.samples.append((p, 1.0))
        for p in fake_paths:
            self.samples.append((p, 0.0))

        random.shuffle(self.samples)

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        img_path, label = self.samples[idx]
        try:
            image = Image.open(img_path).convert("RGB")
        except Exception:
            # Fallback black image if corrupt
            image = Image.new("RGB", (256, 256), (0, 0, 0))

        if self.transform:
            image = self.transform(image)
        else:
            image = transforms.ToTensor()(image)

        return image, torch.tensor(label, dtype=torch.float32)


def get_default_transforms(is_train: bool = True):
    """
    Data augmentations simulating real-world social media compression and tampering.
    """
    if is_train:
        return transforms.Compose([
            transforms.Resize((256, 256)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.10),
            transforms.ToTensor(),
            # Normalization matching MesoNet scale [0, 1]
        ])
    else:
        return transforms.Compose([
            transforms.Resize((256, 256)),
            transforms.ToTensor(),
        ])


def train_epoch(
    model: nn.Module, 
    loader: DataLoader, 
    criterion: nn.Module, 
    optimizer: optim.Optimizer, 
    device: torch.device
) -> Tuple[float, float]:
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0

    for images, labels in loader:
        images = images.to(device)
        labels = labels.to(device).unsqueeze(1)

        optimizer.zero_grad()
        outputs, _ = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        total_loss += loss.item() * images.size(0)
        preds = (outputs >= 0.5).float()
        correct += (preds == labels).sum().item()
        total += labels.size(0)

    avg_loss = total_loss / max(1, total)
    acc = (correct / max(1, total)) * 100.0
    return avg_loss, acc


def evaluate(
    model: nn.Module, 
    loader: DataLoader, 
    criterion: nn.Module, 
    device: torch.device
) -> Tuple[float, float, float, float]:
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0
    tp, fp, fn, tn = 0, 0, 0, 0

    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            labels = labels.to(device).unsqueeze(1)

            outputs, _ = model(images)
            loss = criterion(outputs, labels)

            total_loss += loss.item() * images.size(0)
            preds = (outputs >= 0.5).float()
            correct += (preds == labels).sum().item()
            total += labels.size(0)

            # Confusion matrix metrics (1=real, 0=fake)
            for p, y in zip(preds.view(-1), labels.view(-1)):
                if p == 1 and y == 1:
                    tp += 1
                elif p == 1 and y == 0:
                    fp += 1
                elif p == 0 and y == 1:
                    fn += 1
                else:
                    tn += 1

    avg_loss = total_loss / max(1, total)
    acc = (correct / max(1, total)) * 100.0
    precision = (tp / max(1, tp + fp)) * 100.0
    recall = (tp / max(1, tp + fn)) * 100.0
    f1 = (2 * precision * recall) / max(1e-5, (precision + recall))

    return avg_loss, acc, precision, f1


def main():
    parser = argparse.ArgumentParser(description="Train MesoNet-4 Deepfake Detector")
    parser.add_argument("--train-dir", type=str, default="data/train", help="Path to training dataset folder")
    parser.add_argument("--val-dir", type=str, default="data/val", help="Path to validation dataset folder")
    parser.add_argument("--epochs", type=int, default=15, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=16, help="Batch size")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate (Adam)")
    parser.add_argument("--pretrained", type=str, default=None, help="Path to initial weights to fine-tune")
    parser.add_argument("--save-weights", type=str, default="intelligence/deepfake/weights/meso4_finetuned.pth", help="Output weights path")
    parser.add_argument("--eval-only", action="store_true", help="Run evaluation only")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[*] Training Device: {device}")

    model = Meso4().to(device)

    # Load initial weights if provided or use default FaceForensics weights
    init_weights = args.pretrained or os.path.join(os.path.dirname(__file__), "weights", "meso4_df.pth")
    if os.path.exists(init_weights):
        print(f"[*] Loading pretrained baseline weights from {init_weights}...")
        state_dict = torch.load(init_weights, map_location=device, weights_only=True)
        model.load_state_dict(state_dict)

    criterion = nn.BCELoss()
    optimizer = optim.Adam(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-6)

    # Prepare datasets
    train_transform = get_default_transforms(is_train=True)
    val_transform = get_default_transforms(is_train=False)

    if not os.path.exists(args.train_dir) and not args.eval_only:
        print(f"[!] Training directory {args.train_dir} does not exist.")
        print("[!] Tip: Run 'python -m intelligence.deepfake.download_kaggle --extract-frames' to generate dataset from Kaggle DFD.")
        return

    val_dataset = DeepfakeDataset(args.val_dir if os.path.exists(args.val_dir) else args.train_dir, transform=val_transform)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False)

    if args.eval_only:
        print(f"[*] Evaluating on {len(val_dataset)} images...")
        val_loss, val_acc, val_prec, val_f1 = evaluate(model, val_loader, criterion, device)
        print(f"[*] Results: Loss={val_loss:.4f} | Acc={val_acc:.2f}% | Precision={val_prec:.2f}% | F1={val_f1:.2f}%")
        return

    train_dataset = DeepfakeDataset(args.train_dir, transform=train_transform)
    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True)

    print(f"[*] Starting MesoNet Training: {len(train_dataset)} train samples, {len(val_dataset)} val samples")
    best_acc = 0.0

    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_acc, val_prec, val_f1 = evaluate(model, val_loader, criterion, device)
        scheduler.step()
        elapsed = time.time() - t0

        print(
            f"Epoch {epoch:02d}/{args.epochs:02d} [{elapsed:.1f}s] | "
            f"Train Loss: {train_loss:.4f}, Acc: {train_acc:.2f}% | "
            f"Val Loss: {val_loss:.4f}, Acc: {val_acc:.2f}%, F1: {val_f1:.2f}%"
        )

        if val_acc > best_acc:
            best_acc = val_acc
            os.makedirs(os.path.dirname(args.save_weights), exist_ok=True)
            torch.save(model.state_dict(), args.save_weights)
            print(f" -> Best checkpoint saved to {args.save_weights} (Acc: {best_acc:.2f}%)")

    print(f"[*] Training finished. Final best accuracy: {best_acc:.2f}%")


if __name__ == "__main__":
    main()
