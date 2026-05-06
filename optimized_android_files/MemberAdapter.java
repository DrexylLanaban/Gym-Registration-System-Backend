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
import com.example.gymregistrationsystem.databinding.ItemMemberBinding;
import com.example.gymregistrationsystem.models.Member;

import java.util.ArrayList;
import java.util.List;

public class MemberAdapter extends RecyclerView.Adapter<MemberAdapter.MemberViewHolder> {
    private List<Member> memberList = new ArrayList<>();
    private final OnMemberClickListener listener;
    private final Context context;

    public interface OnMemberClickListener {
        void onMemberClick(Member member);
    }

    // Optimized ViewHolder with binding
    public static class MemberViewHolder extends RecyclerView.ViewHolder {
        private final ItemMemberBinding binding;

        public MemberViewHolder(ItemMemberBinding binding) {
            super(binding.getRoot());
            this.binding = binding;
        }

        public void bind(Member member, OnMemberClickListener listener) {
            // Bind member data with optimizations
            binding.tvMemberName.setText(member.getFullName());
            binding.tvEmail.setText(member.getEmail());
            binding.tvPhone.setText(member.getPhone());

            // Status with admin detection
            if (member.isAdmin()) {
                binding.tvStatus.setText("PERMANENT");
                binding.tvStatus.setTextColor(Color.parseColor("#FFD700"));
                binding.tvPlan.setText("ADMIN");
                binding.tvPlan.setTextColor(Color.parseColor("#FFD700"));
                
                // Admin tag
                binding.tvAdminTag.setVisibility(View.VISIBLE);
                binding.tvAdminTag.setText("ADMIN");
                binding.tvAdminTag.setBackgroundColor(Color.parseColor("#FFD700"));
                binding.tvAdminTag.setTextColor(Color.BLACK);
            } else {
                String status = member.getStatus();
                String plan = member.getCurrentPlan();
                
                binding.tvStatus.setText(status);
                binding.tvPlan.setText(plan);
                binding.tvAdminTag.setVisibility(View.GONE);

                // Color coding for status
                switch (status.toLowerCase()) {
                    case "active":
                        binding.tvStatus.setTextColor(Color.parseColor("#4CAF50"));
                        break;
                    case "expired":
                        binding.tvStatus.setTextColor(Color.parseColor("#F44336"));
                        break;
                    case "inactive":
                        binding.tvStatus.setTextColor(Color.parseColor("#FF9800"));
                        break;
                    default:
                        binding.tvStatus.setTextColor(Color.parseColor("#9E9E9E"));
                        break;
                }
            }

            // Optimized image loading with Glide
            loadImage(member.getProfilePhoto(), binding.ivPhoto);

            // Set click listener
            itemView.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onMemberClick(member);
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
    public static class MemberDiffCallback extends DiffUtil.ItemCallback<Member> {
        @Override
        public boolean areItemsTheSame(@NonNull Member oldItem, @NonNull Member newItem) {
            return oldItem.getId() == newItem.getId();
        }

        @Override
        public boolean areContentsTheSame(@NonNull Member oldItem, @NonNull Member newItem) {
            return oldItem.getFullName().equals(newItem.getFullName()) &&
                   oldItem.getStatus().equals(newItem.getStatus()) &&
                   oldItem.getEmail().equals(newItem.getEmail());
        }
    }

    // Use AsyncListDiffer for smooth updates
    private final AsyncListDiffer<Member> differ = new AsyncListDiffer<>(
            this, new MemberDiffCallback()
    );

    public MemberAdapter(Context context, OnMemberClickListener listener) {
        this.context = context;
        this.listener = listener;
    }

    @NonNull
    @Override
    public MemberViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        ItemMemberBinding binding = ItemMemberBinding.inflate(
                LayoutInflater.from(parent.getContext()), parent, false);
        return new MemberViewHolder(binding);
    }

    @Override
    public void onBindViewHolder(@NonNull MemberViewHolder holder, int position) {
        Member member = differ.getCurrentList().get(position);
        holder.bind(member, listener);
    }

    @Override
    public int getItemCount() {
        return differ.getCurrentList().size();
    }

    // Optimized submit method
    public void submitList(List<Member> newList) {
        differ.submitList(newList != null ? new ArrayList<>(newList) : null);
    }

    // Get current list
    public List<Member> getCurrentList() {
        return new ArrayList<>(differ.getCurrentList());
    }

    // Clear cache when needed
    public void clearCache() {
        Glide.with(context).clearMemoryCache();
    }
}
