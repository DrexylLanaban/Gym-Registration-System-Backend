package com.example.gymregistrationsystem.adapters;

import android.content.Context;
import android.graphics.Color;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.DiffUtil;
import androidx.recyclerview.widget.AsyncListDiffer;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.engine.DiskCacheStrategy;
import com.example.gymregistrationsystem.R;
import com.example.gymregistrationsystem.databinding.ItemTrainerBinding;
import com.example.gymregistrationsystem.models.Trainer;

import java.util.ArrayList;
import java.util.List;

public class TrainerAdapter extends RecyclerView.Adapter<TrainerAdapter.TrainerViewHolder> {
    private List<Trainer> trainerList = new ArrayList<>();
    private final OnTrainerClickListener listener;
    private final Context context;

    public interface OnTrainerClickListener {
        void onTrainerClick(Trainer trainer);
        void onBookSessionClick(Trainer trainer);
    }

    // Optimized ViewHolder with binding
    public static class TrainerViewHolder extends RecyclerView.ViewHolder {
        private final ItemTrainerBinding binding;

        public TrainerViewHolder(ItemTrainerBinding binding) {
            super(binding.getRoot());
            this.binding = binding;
        }

        public void bind(Trainer trainer, OnTrainerClickListener listener) {
            // Bind trainer data with optimizations
            binding.tvTrainerName.setText(trainer.getFullName());
            binding.tvSpecialization.setText(trainer.getSpecialization().toUpperCase());
            binding.tvDescription.setText(trainer.getDescription());
            binding.tvMemberCount.setText(trainer.getMemberCount() + " DISCIPLES");

            // Status indicator with color coding
            String status = trainer.getStatus();
            if (status != null && status.equalsIgnoreCase("active")) {
                binding.tvStatusLabel.setText("AVAILABLE");
                binding.tvStatusLabel.setBackgroundColor(Color.parseColor("#4CAF50"));
                binding.viewStatusIndicator.setBackgroundColor(Color.parseColor("#4CAF50"));
                binding.btnBookSession.setEnabled(true);
                binding.btnBookSession.setAlpha(1.0f);
            } else {
                binding.tvStatusLabel.setText("UNAVAILABLE");
                binding.tvStatusLabel.setBackgroundColor(Color.parseColor("#F44336"));
                binding.viewStatusIndicator.setBackgroundColor(Color.parseColor("#F44336"));
                binding.btnBookSession.setEnabled(false);
                binding.btnBookSession.setAlpha(0.5f);
            }

            // Optimized image loading
            loadImage(trainer.getDisplayImage(), binding.ivTrainerPhoto);

            // FIXED: Card click goes to trainer details
            binding.getRoot().setOnClickListener(v -> {
                if (listener != null) {
                    listener.onTrainerClick(trainer);
                }
            });

            // FIXED: Book session button goes to booking activity
            binding.btnBookSession.setOnClickListener(v -> {
                if (listener != null && trainer.getStatus() != null && trainer.getStatus().equalsIgnoreCase("active")) {
                    listener.onBookSessionClick(trainer);
                }
            });
        }

        private void loadImage(String imageUrl, ImageView imageView) {
            if (imageUrl != null && !imageUrl.isEmpty()) {
                if (imageUrl.startsWith("data:image/")) {
                    Glide.with(imageView.getContext())
                            .load(imageUrl)
                            .placeholder(R.drawable.ic_avatar_placeholder)
                            .error(R.drawable.ic_avatar_placeholder)
                            .diskCacheStrategy(DiskCacheStrategy.ALL)
                            .override(200, 200)
                            .centerCrop()
                            .into(imageView);
                } else {
                    Glide.with(imageView.getContext())
                            .load(imageUrl)
                            .placeholder(R.drawable.ic_avatar_placeholder)
                            .error(R.drawable.ic_avatar_placeholder)
                            .diskCacheStrategy(DiskCacheStrategy.ALL)
                            .override(200, 200)
                            .centerCrop()
                            .into(imageView);
                }
            } else {
                imageView.setImageResource(R.drawable.ic_avatar_placeholder);
            }
        }
    }

    // Optimized diff callback for smooth updates
    public static class TrainerDiffCallback extends DiffUtil.ItemCallback<Trainer> {
        @Override
        public boolean areItemsTheSame(@NonNull Trainer oldItem, @NonNull Trainer newItem) {
            return oldItem.getId() == newItem.getId();
        }

        @Override
        public boolean areContentsTheSame(@NonNull Trainer oldItem, @NonNull Trainer newItem) {
            return oldItem.getFullName().equals(newItem.getFullName()) &&
                   oldItem.getStatus().equals(newItem.getStatus()) &&
                   oldItem.getSpecialization().equals(newItem.getSpecialization());
        }
    }

    // Use AsyncListDiffer for smooth updates
    private final AsyncListDiffer<Trainer> differ = new AsyncListDiffer<>(
            this, new TrainerDiffCallback()
    );

    public TrainerAdapter(Context context, OnTrainerClickListener listener) {
        this.context = context;
        this.listener = listener;
    }

    @NonNull
    @Override
    public TrainerViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        ItemTrainerBinding binding = ItemTrainerBinding.inflate(
                LayoutInflater.from(parent.getContext()), parent, false);
        return new TrainerViewHolder(binding);
    }

    @Override
    public void onBindViewHolder(@NonNull TrainerViewHolder holder, int position) {
        Trainer trainer = differ.getCurrentList().get(position);
        holder.bind(trainer, listener);
    }

    @Override
    public int getItemCount() {
        return differ.getCurrentList().size();
    }

    // Optimized submit method
    public void submitList(List<Trainer> newList) {
        differ.submitList(newList != null ? new ArrayList<>(newList) : null);
    }

    // Get current list
    public List<Trainer> getCurrentList() {
        return new ArrayList<>(differ.getCurrentList());
    }

    // Clear cache when needed
    public void clearCache() {
        Glide.with(context).clearMemoryCache();
    }
}
