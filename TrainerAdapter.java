package com.example.gymregistrationsystem.adapters;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.example.gymregistrationsystem.R;
import com.example.gymregistrationsystem.models.Trainer;

import java.util.List;

public class TrainerAdapter extends RecyclerView.Adapter<TrainerAdapter.TrainerViewHolder> {

    private List<Trainer> trainerList;
    private OnTrainerClickListener listener;
    private Context context;

    public interface OnTrainerClickListener {
        void onTrainerClick(Trainer trainer);
    }

    public TrainerAdapter(List<Trainer> trainerList, OnTrainerClickListener listener) {
        this.trainerList = trainerList;
        this.listener = listener;
    }

    @NonNull
    @Override
    public TrainerViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        context = parent.getContext();
        View view = LayoutInflater.from(context).inflate(R.layout.item_trainer, parent, false);
        return new TrainerViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull TrainerViewHolder holder, int position) {
        Trainer trainer = trainerList.get(position);
        
        holder.tvName.setText(trainer.getFullName() != null ? trainer.getFullName() : "Unknown");
        holder.tvSpecialization.setText(trainer.getSpecialization() != null ? trainer.getSpecialization() : "No Specialization");
        holder.tvFollowers.setText(trainer.getMemberCount() + " FOLLOWERS");
        
        // Load trainer photo
        loadTrainerImage(trainer, holder.ivProfile);
        
        // Set click listener
        holder.itemView.setOnClickListener(v -> {
            if (listener != null) {
                listener.onTrainerClick(trainer);
            }
        });
    }

    @Override
    public int getItemCount() {
        return trainerList.size();
    }

    private void loadTrainerImage(Trainer trainer, ImageView imageView) {
        String imageUrl = trainer.getDisplayImage();
        
        if (imageUrl != null && !imageUrl.trim().isEmpty()) {
            if (imageUrl.startsWith("data:image/")) {
                // Handle base64 image
                loadBase64Image(imageUrl, imageView);
            } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
                // Handle regular URL (if you have an image loading library like Glide or Picasso)
                // For now, we'll just show placeholder
                showPlaceholder(imageView);
            } else {
                showPlaceholder(imageView);
            }
        } else {
            showPlaceholder(imageView);
        }
    }

    private void loadBase64Image(String base64String, ImageView imageView) {
        try {
            // Extract the base64 part (remove "data:image/jpeg;base64," prefix)
            String base64Image = base64String.split(",")[1];
            
            // Decode base64 to byte array
            byte[] decodedString = Base64.decode(base64Image, Base64.DEFAULT);
            
            // Convert to bitmap
            Bitmap bitmap = BitmapFactory.decodeByteArray(decodedString, 0, decodedString.length);
            
            if (bitmap != null) {
                imageView.setImageBitmap(bitmap);
            } else {
                showPlaceholder(imageView);
            }
        } catch (Exception e) {
            // If decoding fails, show placeholder
            showPlaceholder(imageView);
        }
    }

    private void showPlaceholder(ImageView imageView) {
        // Set your placeholder image here
        imageView.setImageResource(R.drawable.ic_profile_placeholder);
    }

    public void updateList(List<Trainer> newTrainerList) {
        this.trainerList = newTrainerList;
        notifyDataSetChanged();
    }

    static class TrainerViewHolder extends RecyclerView.ViewHolder {
        ImageView ivProfile;
        TextView tvName, tvSpecialization, tvFollowers;

        TrainerViewHolder(@NonNull View itemView) {
            super(itemView);
            ivProfile = itemView.findViewById(R.id.ivProfile);
            tvName = itemView.findViewById(R.id.tvName);
            tvSpecialization = itemView.findViewById(R.id.tvSpecialization);
            tvFollowers = itemView.findViewById(R.id.tvFollowers);
        }
    }
}
